//! Tokens signed with throwaway keys made for these tests only (they sign
//! nothing real), checked the way Google-signed ones are.

use std::collections::HashMap;

use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, encode};
use serde_json::{Value, json};

use super::{AuthError, Verifier, max_age};

const PROJECT: &str = "numeria-test";

const SIGNING_KEY: &str = "-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDVhan3YSEXk+p4
hS3XjNVt1T6EUUie5ysbZRheEwp+2m2gLrMPhzkAe2Nxufnw1r2p53Z3PQ5r90lW
HgF4NXfpG/yCmIdxjxFsp/FO3sfkeLwBRH7XPU3mIqeBPkEk0Gmsf2JBwao4wEGL
v4twSVYXbmH2KDLx/6cgNFa2gMmRfSfKRxqKdQT6llDnk1/1UVew/rXtAmMNdQze
Q5FuDbowQbXug+9xSBVPvUkzx8OkaxLiSvxFn7Ej4Vpm4eUGcmJW7M0pMHA3FrU/
/1IsobHgaVXm7/UfHnQwQ+vlZNFQ+LsDIUf+7BBEOxccnbAqqzzgc1xbOBzsX8ZE
DA95PTlzAgMBAAECggEABrDglEhD5t7ouwwZVVGBd/v1sI8c18s7Vj7DFmJBsvCZ
/NSvIcPFV9bbVTtUXLqt8361qfjiKc9Jn1w4ruamB5+r4v/FRsa1RL1ihMEwbGAS
1stUWjRT65aXFH1klzMSDKi/5dBGyu54tK4KQDjcF3HgZKalKguD1jDYWBxjCfRe
Y6YCV4YVERdJBtLAd6fkSVptMVI4ESRbkqUEvpLELopYgPz1BnpkFqX1nG/nELeZ
itw3ANVnp+fNm/8ht8xOsMRg61i29rxtyH/h8VaM/If9QDx204B3tqX2Sg12I9Fl
xs6rDhS8ZffS6EsJxOpuuFHADfEvPCXcAbJvFmd6MQKBgQD1ZGNDjRJlfro30qNy
R6L+iBpFx0L3Uj8oB11jtsC3z7Fo2LKhC7Fp9SqkqjwF/nvSFdHgKS/ACrTfnvAq
3k3cVQNbAhY2CwQP/3n/vctICASu1ST7H3VrkS/EDOQ6Gj5rjCcTr0kbMt1jN3SF
WVOQiRbzT/OFyzZAeU1j1/S9ewKBgQDewJbYgJgcCMJc4XDTvazcDv/12cgOhwKc
9GkEltOq1MJy0GkNJeEkeNuohLQRAbj0SUh4REapV2cLfS736VA3bIZiWxZy6smo
VfYpr05Ki/DqsAQE7laRem3U/WPFd7BuGrf89DUTj+eg2ZMdxri96DFw2j+qSPT7
ZaLbjy3maQKBgQDa6n3rq5S32wCCAHYz41izvfPCQGurfEI/kaJs7IKs+KqKoJdr
OKVDo6YxVHVL26XW3ARp+BRTPLnzrTUQ6VWItIbTz97Ew7sSEpZh4o3RauXSmu/s
4Dm+hr2YJvAMLZF2HIhX9U5A53W9p6FZvUDhdot08OSNfaaeihjSc7wwtQKBgCiw
/d1nAGJ+pyLYfAfyKlW418FNm2Ir/6o0a8rO0rPuUecvc0FXnh1PhrDuLQa+Tc8y
Y+60akQdF1Hd+GqJUIIPbS0ifqNXiKcbrPBIegDcN5JnvRQ5hc7lkpLKByPXjX9P
mjS3V8rPCv0zQdC6sJzggcef1umAkmAqXOnG6hehAoGBAOzIUjVE3NlsMnlG7Ujj
tAvO6AzI88VC/ItgJhD/xyoEeIMQDch8qKGR3DtXJpIQOHC0pQvarU+KcrOFlLnz
HRZu50LPgYf8mSEGsSXvaCzv2kKaUtc9duApKnNnIVEGqyw6yasgt3tHjgshF3d1
NjeaBBrLiQh7MFqfnU3PoxAA
-----END PRIVATE KEY-----";
const PUBLIC_KEY: &str = "-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1YWp92EhF5PqeIUt14zV
bdU+hFFInucrG2UYXhMKftptoC6zD4c5AHtjcbn58Na9qed2dz0Oa/dJVh4BeDV3
6Rv8gpiHcY8RbKfxTt7H5Hi8AUR+1z1N5iKngT5BJNBprH9iQcGqOMBBi7+LcElW
F25h9igy8f+nIDRWtoDJkX0nykcainUE+pZQ55Nf9VFXsP617QJjDXUM3kORbg26
MEG17oPvcUgVT71JM8fDpGsS4kr8RZ+xI+FaZuHlBnJiVuzNKTBwNxa1P/9SLKGx
4GlV5u/1Hx50MEPr5WTRUPi7AyFH/uwQRDsXHJ2wKqs84HNcWzgc7F/GRAwPeT05
cwIDAQAB
-----END PUBLIC KEY-----";
/// A key Google never published: tokens it signs must fail.
const STRANGER_KEY: &str = "-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDxOj+gPecin1Or
oPPJJtFuI69Kp2pR1sYingNrYPZUruH0EmZpAk7/wAj3lKb+eh1+G+HsL/Cn60jv
WunAuffpKdu+cNvzmdB1wY57H81gNNcffWtyqZJkXZBa4xYPZOBLrHGFhfHRZgT+
hoxzeA25VL5DBjRCEl7GqvzIrDoJeaxfYrjREs2QEv5iwnIsjPhF0KihrkiI2RvR
BFTfcGLV1KfC8bdVJ28pCU+kbiYpWpzPMnDd4aymT5zF01HyN9algZtTriWasDq1
C4L3xQwAzo3j6fXvI6rA8HD/hBOIFdgg4JYEAJ2UaMoK8lbDkeGVjkMU6pYTeLKT
NoAJn2FZAgMBAAECggEAHbf5Yrp9oUxTuI9JuXxozNLko6Pge1ikbFtfPHljn6cz
+yfRKhq4tNVpxWaw9CUDQSgaO0jksytPfv2KUs4WdslLYzjwQCCxB/DiptSSLsoT
vrNq62Nsv6SvRiM38omRAIGsMrD/y7Zv4xOcdhVSS4TfM86t3X354yvpnKdrNwNj
N+iYs0Ee2jLBmscUjFbnO5ZdRvwY372rcJa9jsrrCUVw429sa185k/4Bx1kmX/ps
7ekbXt5hato2IT37LSz0KuhSBRCXF2vxqSUGBiNp9g/mtomqAvSDAHxuQYacVlL8
WbKAHqSGUeezCnwvX12ZrQMAtm0/9QWq3MOvMk+6AQKBgQD4uk0J00KR860OsXlU
v48YUemOWAlKsK34Begh41EEFJjwMfZKpiooH+F97h12hHSB54zfNBt1aPlM9BzK
Stz+KeumiUOTVdtwX1n4N+7RgwlmQO76chYcXnbTDfJ79k6hOM0Y7ng5j5zPfmvc
iZ8FQAc7PhZ7NLMhvM01/7yC4QKBgQD4R882Qcxcew4dbapJItC87teqcnBtI93t
oVCjLZHmdBt/eyhz4zCcu2yA0SxLqzb96g4pGGAMNMnBqeLHeXB9jWO0EKi2KRYy
3nRf2FUNW4f/7QkK8RU7Bx1DdDx+3zo5nJZQ+by9WsjnpVgwrlhKBRkEXpkODVQ/
6Ie6mPsleQKBgDGs+6/nqpb9xOV3WpUrgQfJbE0Klih9qvErNNZ30Plwp67pO5hj
IW5MF7wP74B5Kc+8EC2P+Z/0bD4LTyiz1PlKJA9pwL5PWnlSAeUKPr9HXXw3ocMR
QAtAbpjuYyyQ39lhP80n64kLfrUOObqdHc5toEQbvV+0AcbOL2oGfn7hAoGAXWsP
kXeygD2g8vu3betWpTAtH6oNmVM8htQCtlNIKXEYg6AAeZJLUT3INrP9ub8DYwi1
KUtNoGogW+kjNjEAXY1crXzzLg9JlfxTx1hrsCn3gxlaJK7PcTVdEmti883kZ5b+
jBtbo9fL7jUteKuw9rDyV82MQ1hKkf1ZTKGRJekCgYEAwDE73yBQeh6G2q6eHaBo
6t3Z4HO8DAOYmPIt6EuciA47GpHH3c9b663sMSNQ9t8wi9F0ecapcT6UTmq5ga5M
WbfuigZ+Jd3WRtiR6Tykv3kG+9jH0IUuhvDfTZDrG5wp0rFNgiz/CGKUaZPMe+yk
HznvIo6/rAQfml0U8pZ8JAI=
-----END PRIVATE KEY-----";

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

fn claims() -> Value {
    let t = now();
    json!({
        "iss": format!("https://securetoken.google.com/{PROJECT}"),
        "aud": PROJECT,
        "auth_time": t - 10,
        "iat": t - 10,
        "exp": t + 3600,
        "sub": "uid-123",
        "email": "rina@school.example",
        "email_verified": true,
        "name": "Rina",
        "firebase": { "sign_in_provider": "google.com" }
    })
}

fn sign(claims: &Value, kid: &str, pem: &str) -> String {
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some(kid.into());
    encode(
        &header,
        claims,
        &EncodingKey::from_rsa_pem(pem.as_bytes()).unwrap(),
    )
    .unwrap()
}

fn verifier() -> Verifier {
    let mut keys = HashMap::new();
    keys.insert(
        "k1".to_string(),
        DecodingKey::from_rsa_pem(PUBLIC_KEY.as_bytes()).unwrap(),
    );
    Verifier::with_keys(PROJECT.into(), keys)
}

#[tokio::test]
async fn accepts_a_good_token() {
    let adult = verifier()
        .verify(&sign(&claims(), "k1", SIGNING_KEY))
        .await
        .unwrap();
    assert_eq!(adult.uid, "uid-123");
    assert_eq!(adult.email, "rina@school.example");
    assert!(adult.email_verified);
    assert_eq!(adult.name, "Rina");
    assert_eq!(adult.provider, "google.com");
}

async fn rejected(c: Value, kid: &str, pem: &str) -> AuthError {
    verifier().verify(&sign(&c, kid, pem)).await.unwrap_err()
}

#[tokio::test]
async fn rejects_another_project() {
    let mut c = claims();
    c["aud"] = json!("someone-else");
    assert!(matches!(
        rejected(c, "k1", SIGNING_KEY).await,
        AuthError::Invalid(_)
    ));
    let mut c = claims();
    c["iss"] = json!("https://securetoken.google.com/someone-else");
    assert!(matches!(
        rejected(c, "k1", SIGNING_KEY).await,
        AuthError::Invalid(_)
    ));
}

#[tokio::test]
async fn rejects_an_expired_token() {
    let mut c = claims();
    c["exp"] = json!(now() - 600);
    assert!(matches!(
        rejected(c, "k1", SIGNING_KEY).await,
        AuthError::Invalid(_)
    ));
}

#[tokio::test]
async fn rejects_a_forged_signature_and_unknown_keys() {
    assert!(matches!(
        rejected(claims(), "k1", STRANGER_KEY).await,
        AuthError::Invalid(_)
    ));
    assert!(matches!(
        rejected(claims(), "k9", SIGNING_KEY).await,
        AuthError::Invalid(_)
    ));
}

#[tokio::test]
async fn rejects_a_future_sign_in_and_an_empty_subject() {
    let mut c = claims();
    c["auth_time"] = json!(now() + 3600);
    assert!(matches!(
        rejected(c, "k1", SIGNING_KEY).await,
        AuthError::Invalid(_)
    ));
    let mut c = claims();
    c["sub"] = json!("");
    assert!(matches!(
        rejected(c, "k1", SIGNING_KEY).await,
        AuthError::Invalid(_)
    ));
}

#[tokio::test]
async fn needs_an_email() {
    let mut c = claims();
    c.as_object_mut().unwrap().remove("email");
    assert!(matches!(
        rejected(c, "k1", SIGNING_KEY).await,
        AuthError::NoEmail
    ));
}

#[tokio::test]
async fn rejects_garbage() {
    assert!(matches!(
        verifier().verify("not.a.token").await,
        Err(AuthError::Invalid(_))
    ));
    assert!(matches!(
        verifier().verify("").await,
        Err(AuthError::Invalid(_))
    ));
}

#[test]
fn reads_max_age() {
    assert_eq!(
        max_age("public, max-age=19008, must-revalidate"),
        Some(std::time::Duration::from_secs(19008))
    );
    assert_eq!(max_age("no-cache"), None);
}
