//! Letters to teachers through one SMTP mailbox (a Google Workspace account
//! with an app password). For now there is one letter: a teacher's account
//! has been verified, by an admin or by a school email domain.
//!
//! Settings, all from the environment:
//! - `SMTP_USER`, `SMTP_PASSWORD`: the mailbox and its app password. Without
//!   both nothing is sent; the server says so once when it starts.
//! - `SMTP_HOST` (`smtp.gmail.com`), `SMTP_PORT` (465 is TLS from the start,
//!   587 is STARTTLS).
//! - `MAIL_FROM` (the mailbox itself), `MAIL_FROM_NAME` (`Numeria Arena`),
//!   `MAIL_REPLY_TO` (none): who the letter is from and where replies go.
//! - `APP_URL`: the site the letter's button opens.
//!
//! A letter is sent beside the request, never inside it: an admin's decision
//! never waits for or fails with the mail. A letter that cannot be sent is
//! logged with the teacher's id, never with the address.

use lettre::message::header::ContentType;
use lettre::message::{Attachment, Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

const CHICKEN: &[u8] = include_bytes!("../mail/chicken.png");
const TITLE: &[u8] = include_bytes!("../mail/title.png");
const APP_URL: &str = "https://numeria.eziedutech.dev";

pub struct Mailer {
    inner: Option<Inner>,
}

struct Inner {
    smtp: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
    reply_to: Option<Mailbox>,
    app_url: String,
}

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

impl Mailer {
    pub fn from_env() -> Self {
        let (Some(user), Some(password)) = (env("SMTP_USER"), env("SMTP_PASSWORD")) else {
            tracing::info!("mail: off (SMTP_USER and SMTP_PASSWORD are not set)");
            return Self { inner: None };
        };
        match Inner::new(user, password) {
            Ok(inner) => {
                tracing::info!("mail: on, from {}", inner.from.email);
                Self { inner: Some(inner) }
            }
            Err(why) => {
                tracing::warn!("mail: off ({why})");
                Self { inner: None }
            }
        }
    }

    /// Tells a teacher their account is verified. Returns at once.
    pub fn verified(&self, user_id: i64, email: &str, name: &str) {
        let Some(inner) = &self.inner else { return };
        let letter = match inner.verified(email, name) {
            Ok(letter) => letter,
            Err(why) => {
                tracing::warn!("mail: no letter for user {user_id} ({why})");
                return;
            }
        };
        let smtp = inner.smtp.clone();
        tokio::spawn(async move {
            match smtp.send(letter).await {
                Ok(_) => tracing::info!("mail: verified letter sent to user {user_id}"),
                Err(e) => tracing::warn!("mail: verified letter to user {user_id} failed: {e}"),
            }
        });
    }
}

impl Inner {
    fn new(user: String, password: String) -> Result<Self, String> {
        let host = env("SMTP_HOST").unwrap_or_else(|| "smtp.gmail.com".into());
        let port: u16 = match env("SMTP_PORT") {
            Some(p) => p.parse().map_err(|_| format!("SMTP_PORT {p} is not a port"))?,
            None => 465,
        };
        let builder = if port == 465 {
            AsyncSmtpTransport::<Tokio1Executor>::relay(&host)
        } else {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&host)
        }
        .map_err(|e| format!("SMTP_HOST {host}: {e}"))?;
        let smtp = builder.port(port).credentials(Credentials::new(user.clone(), password)).build();

        let name = env("MAIL_FROM_NAME").unwrap_or_else(|| "Numeria Arena".into());
        let address = env("MAIL_FROM").unwrap_or(user);
        let from = Mailbox::new(
            Some(name),
            address.parse().map_err(|_| format!("MAIL_FROM {address} is not an email"))?,
        );
        let reply_to = match env("MAIL_REPLY_TO") {
            Some(r) => Some(r.parse().map_err(|_| format!("MAIL_REPLY_TO {r} is not an email"))?),
            None => None,
        };
        let app_url = env("APP_URL").unwrap_or_else(|| APP_URL.into()).trim_end_matches('/').to_string();
        Ok(Self { smtp, from, reply_to, app_url })
    }

    fn verified(&self, email: &str, name: &str) -> Result<Message, String> {
        let to: Mailbox = email.parse().map_err(|_| "the address is not an email".to_string())?;
        let link = format!("{}/manage", self.app_url);
        let mut letter = Message::builder()
            .from(self.from.clone())
            .to(to)
            .subject("Your teacher account is verified · Akun guru Anda terverifikasi");
        if let Some(r) = &self.reply_to {
            letter = letter.reply_to(r.clone());
        }
        let png: ContentType = ContentType::parse("image/png").expect("a content type");
        letter
            .multipart(
                MultiPart::alternative()
                    .singlepart(SinglePart::plain(verified_text(name, &link)))
                    .multipart(
                        MultiPart::related()
                            .singlepart(SinglePart::html(verified_html(name, &link)))
                            .singlepart(Attachment::new_inline("chicken".into()).body(CHICKEN.to_vec(), png.clone()))
                            .singlepart(Attachment::new_inline("title".into()).body(TITLE.to_vec(), png)),
                    ),
            )
            .map_err(|e| e.to_string())
    }
}

/// The words of the verified letter, English then Indonesian.
struct Words {
    hello: &'static str,
    head: &'static str,
    body: &'static str,
    can: [&'static str; 4],
    button: &'static str,
}

const EN: Words = Words {
    hello: "Hello",
    head: "Your teacher account is verified",
    body: "An admin has checked that you teach at a school. Your account now has everything a teacher needs, and any trial class carries on with nothing lost.",
    can: [
        "Up to 30 classes with up to 100 seats each",
        "Class races, race rooms and the class screen",
        "Your classes can join the global leaderboard",
        "Class reports and practice ideas for every seat",
    ],
    button: "OPEN MY CLASSES",
};

const ID: Words = Words {
    hello: "Halo",
    head: "Akun guru Anda sudah terverifikasi",
    body: "Admin sudah memeriksa bahwa Anda mengajar di sebuah sekolah. Akun Anda kini punya semua yang dibutuhkan guru, dan kelas percobaan berjalan lagi tanpa ada yang hilang.",
    can: [
        "Sampai 30 kelas, masing-masing sampai 100 kursi",
        "Balapan kelas, ruang lomba, dan layar kelas",
        "Kelas Anda bisa ikut papan peringkat global",
        "Laporan kelas dan saran latihan untuk setiap kursi",
    ],
    button: "BUKA KELAS SAYA",
};

fn verified_text(name: &str, link: &str) -> String {
    let part = |w: &Words| {
        let list: String = w.can.iter().map(|c| format!("- {c}\n")).collect();
        format!("{} {name},\n\n{}.\n\n{}\n\n{list}\n{}: {link}\n", w.hello, w.head, w.body, w.button)
    };
    format!("{}\n---\n\n{}\nNumeria Arena\n", part(&EN), part(&ID))
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

// The site's paper colours (frontrouter app.css) and the boot screen's three folds.
const SAND: &str = "#e0c780";
const PAPER: &str = "#fffdf8";
const INK: &str = "#3a3f4b";
const INK_SOFT: &str = "#5d6270";
const COBALT: &str = "#3469c4";
const CORAL: &str = "#f2716b";
const TEAL: &str = "#3fb6a0";
const FONT: &str = "'Helvetica Neue',Helvetica,Arial,sans-serif";

fn verified_html(name: &str, link: &str) -> String {
    let name = escape(name);
    let link = escape(link);
    let part = |w: &Words, lang: &str| {
        let list: String = w
            .can
            .iter()
            .map(|c| {
                format!(
                    r#"<tr><td width="22" valign="top" style="padding:0 0 8px;color:{TEAL};font:700 15px/22px {FONT};">&#10003;</td><td style="padding:0 0 8px;color:{INK};font:15px/22px {FONT};">{c}</td></tr>"#
                )
            })
            .collect();
        format!(
            r#"<div lang="{lang}">
<p style="margin:0 0 6px;color:{INK_SOFT};font:15px/22px {FONT};">{hello} {name},</p>
<h1 style="margin:0 0 14px;color:{INK};font:700 22px/30px {FONT};">{head}</h1>
<p style="margin:0 0 18px;color:{INK};font:15px/23px {FONT};">{body}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">{list}</table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:{COBALT};border-radius:6px;">
<a href="{link}" style="display:inline-block;padding:13px 26px;color:{PAPER};font:700 14px/18px {FONT};letter-spacing:1.5px;text-decoration:none;">{button}</a>
</td></tr></table>
</div>"#,
            hello = w.hello,
            head = w.head,
            body = w.body,
            button = w.button,
        )
    };
    let en = part(&EN, "en");
    let id = part(&ID, "id");
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>{head}</title>
</head>
<body style="margin:0;padding:0;background:{SAND};">
<div style="display:none;max-height:0;overflow:hidden;">{head}. {head_id}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{SAND};">
<tr><td align="center" style="padding:32px 14px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td align="center" style="padding:0 0 4px;"><img src="cid:chicken" width="96" height="96" alt="" style="display:block;border:0;"></td></tr>
<tr><td align="center" style="padding:0 0 22px;"><img src="cid:title" width="320" height="63" alt="Numeria Arena" style="display:block;border:0;max-width:80%;height:auto;"></td></tr>
<tr><td style="background:{PAPER};border-radius:4px;box-shadow:4px 7px 12px rgba(70,50,25,0.32);">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td height="6" style="background:{CORAL};border-radius:4px 0 0 0;font-size:0;line-height:0;">&nbsp;</td>
<td height="6" style="background:{COBALT};font-size:0;line-height:0;">&nbsp;</td>
<td height="6" style="background:{TEAL};border-radius:0 4px 0 0;font-size:0;line-height:0;">&nbsp;</td>
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:30px 34px 30px;">{en}</td></tr>
<tr><td style="padding:0 34px;"><div style="border-top:1px dashed #d8cdb4;font-size:0;line-height:0;">&nbsp;</div></td></tr>
<tr><td style="padding:30px 34px 34px;">{id}</td></tr>
</table>
</td></tr>
<tr><td align="center" style="padding:22px 20px 0;color:{INK};font:13px/20px {FONT};">
Numeria Arena<br>
<span style="color:{INK_SOFT};">You get this letter because you signed up as a teacher. · Anda menerima surat ini karena mendaftar sebagai guru.</span>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"#,
        head = EN.head,
        head_id = ID.head,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_letter_keeps_a_name_from_being_markup() {
        let html = verified_html("<b>Rina</b> & co", "https://example.test/manage");
        assert!(html.contains("&lt;b&gt;Rina&lt;/b&gt; &amp; co"));
        assert!(!html.contains("<b>Rina"));
        assert!(html.contains("cid:chicken") && html.contains("cid:title"));
        assert!(html.contains(EN.button) && html.contains(ID.button));
    }

    #[test]
    fn the_plain_letter_has_both_languages_and_the_link() {
        let text = verified_text("Rina", "https://example.test/manage");
        assert!(text.contains("Hello Rina") && text.contains("Halo Rina"));
        assert!(text.contains("https://example.test/manage"));
    }
}
