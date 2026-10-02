//! Firebase ID tokens: the browser signs an adult in (Google, Facebook or an
//! email link) and sends the token; the server checks it against Google's
//! public keys and the project id, and trusts nothing else from the client.
//! https://firebase.google.com/docs/auth/admin/verify-id-tokens

use std::collections::HashMap;
use std::time::{Duration, Instant};

use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::Deserialize;
use tokio::sync::RwLock;

const KEYS_URL: &str =
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
/// Used when Google's reply carries no max-age.
const KEYS_DEFAULT_TTL: Duration = Duration::from_secs(3600);
/// An unknown key id refetches the keys at most this often.
const KEYS_MIN_REFRESH: Duration = Duration::from_secs(60);

/// Who signed in, as far as the token proves it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Adult {
    pub uid: String,
    pub email: String,
    pub email_verified: bool,
    pub name: String,
    pub provider: String,
}

#[derive(Debug)]
pub enum AuthError {
    /// No token, a malformed one, a bad signature, or the wrong project.
    Invalid(String),
    /// The token is fine but has no email (adult accounts need one).
    NoEmail,
    /// Google's keys could not be fetched.
    KeysUnavailable(String),
}

#[derive(Deserialize)]
struct Claims {
    sub: String,
    auth_time: Option<u64>,
    email: Option<String>,
    email_verified: Option<bool>,
    name: Option<String>,
    firebase: Option<FirebaseClaims>,
}

#[derive(Deserialize)]
struct FirebaseClaims {
    sign_in_provider: Option<String>,
}

struct KeyCache {
    keys: HashMap<String, DecodingKey>,
    fetched: Instant,
    ttl: Duration,
}

pub struct Verifier {
    project: String,
    http: Option<reqwest::Client>,
    cache: RwLock<Option<KeyCache>>,
}

impl Verifier {
    pub fn new(project: String) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("an HTTP client with the installed TLS provider");
        Self {
            project,
            http: Some(http),
            cache: RwLock::new(None),
        }
    }

    /// A verifier with fixed keys and no network, for tests.
    pub fn with_keys(project: String, keys: HashMap<String, DecodingKey>) -> Self {
        let cache = KeyCache {
            keys,
            fetched: Instant::now(),
            ttl: Duration::MAX,
        };
        Self {
            project,
            http: None,
            cache: RwLock::new(Some(cache)),
        }
    }

    pub async fn verify(&self, token: &str) -> Result<Adult, AuthError> {
        let header =
            decode_header(token).map_err(|e| AuthError::Invalid(format!("header: {e}")))?;
        if header.alg != Algorithm::RS256 {
            return Err(AuthError::Invalid(format!("algorithm {:?}", header.alg)));
        }
        let kid = header
            .kid
            .ok_or_else(|| AuthError::Invalid("no key id".into()))?;
        let key = self.key(&kid).await?;

        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_audience(&[&self.project]);
        validation.set_issuer(&[format!("https://securetoken.google.com/{}", self.project)]);
        validation.set_required_spec_claims(&["exp", "iat", "aud", "iss", "sub"]);
        let claims = decode::<Claims>(token, &key, &validation)
            .map_err(|e| AuthError::Invalid(format!("claims: {e}")))?
            .claims;

        if claims.sub.is_empty() || claims.sub.len() > 128 {
            return Err(AuthError::Invalid("subject".into()));
        }
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if claims.auth_time.is_some_and(|t| t > now + 60) {
            return Err(AuthError::Invalid("auth_time in the future".into()));
        }
        let email = claims
            .email
            .filter(|e| !e.is_empty())
            .ok_or(AuthError::NoEmail)?;
        Ok(Adult {
            uid: claims.sub,
            email,
            email_verified: claims.email_verified.unwrap_or(false),
            name: claims.name.unwrap_or_default(),
            provider: claims
                .firebase
                .and_then(|f| f.sign_in_provider)
                .unwrap_or_default(),
        })
    }

    async fn key(&self, kid: &str) -> Result<DecodingKey, AuthError> {
        let stale = {
            let cache = self.cache.read().await;
            match cache.as_ref() {
                Some(c) => {
                    let fresh = c.fetched.elapsed() < c.ttl;
                    if let Some(k) = c.keys.get(kid).filter(|_| fresh) {
                        return Ok(k.clone());
                    }
                    // Fresh keys without this id: refetch, but not on every bad token.
                    !fresh || c.fetched.elapsed() >= KEYS_MIN_REFRESH
                }
                None => true,
            }
        };
        if stale && self.http.is_some() {
            self.refresh().await?;
        }
        let cache = self.cache.read().await;
        cache
            .as_ref()
            .and_then(|c| c.keys.get(kid).cloned())
            .ok_or_else(|| AuthError::Invalid(format!("unknown key id {kid}")))
    }

    async fn refresh(&self) -> Result<(), AuthError> {
        let http = self.http.as_ref().expect("checked by the caller");
        let reply = http
            .get(KEYS_URL)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| AuthError::KeysUnavailable(e.to_string()))?;
        let ttl = reply
            .headers()
            .get(reqwest::header::CACHE_CONTROL)
            .and_then(|v| v.to_str().ok())
            .and_then(max_age)
            .unwrap_or(KEYS_DEFAULT_TTL);
        let set: JwkSet = reply
            .json()
            .await
            .map_err(|e| AuthError::KeysUnavailable(e.to_string()))?;
        let mut keys = HashMap::new();
        for jwk in &set.keys {
            let Some(kid) = jwk.common.key_id.clone() else {
                continue;
            };
            match DecodingKey::from_jwk(jwk) {
                Ok(k) => {
                    keys.insert(kid, k);
                }
                Err(e) => tracing::warn!("skipping Google key {kid}: {e}"),
            }
        }
        if keys.is_empty() {
            return Err(AuthError::KeysUnavailable("no usable keys".into()));
        }
        tracing::info!(
            "fetched {} Firebase signing keys, kept for {}s",
            keys.len(),
            ttl.as_secs()
        );
        *self.cache.write().await = Some(KeyCache {
            keys,
            fetched: Instant::now(),
            ttl,
        });
        Ok(())
    }
}

/// `max-age=19008` from a Cache-Control header.
fn max_age(header: &str) -> Option<Duration> {
    header
        .split(',')
        .filter_map(|part| part.trim().strip_prefix("max-age="))
        .find_map(|v| v.trim().parse::<u64>().ok())
        .map(Duration::from_secs)
}

#[cfg(test)]
mod tests;
