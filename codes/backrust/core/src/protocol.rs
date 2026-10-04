//! Messages between a headset or Arena Screen and the server's rooms.
//!
//! JSON over a WebSocket at `/api/ws`, tagged by `type`. The client only
//! sends what the player did; the server hands out creatures, judges answers
//! on its own clock and keeps the score.

use serde::{Deserialize, Serialize};

use crate::class_match::{ClassEvent, ClassRecap, ClassView};
use crate::race::{RaceOffer, RaceVerdict};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMsg {
    /// Join a room with its play code (a seat) or its watch code (watching).
    /// `resume` is the token from an earlier `welcome`, to take one's seat back;
    /// `host` the token the room's creator got, to start it from a watch screen.
    Hello {
        code: String,
        #[serde(default)]
        resume: Option<String>,
        #[serde(default)]
        host: Option<String>,
    },
    /// Start the match: the room's first seat, or its host.
    Start,
    /// Ask for the next creature at one's desk.
    Next,
    AnswerBalloon {
        offer_id: u32,
        index: usize,
    },
    AnswerOrb {
        offer_id: u32,
        crystals: Vec<usize>,
    },
    /// A watcher cheers the room on; at most one every 10 s.
    Cheer,
}

/// Before the match starts: who has taken a seat so far.
#[derive(Clone, Debug, Serialize)]
pub struct LobbyView {
    pub seats: usize,
    pub names: Vec<String>,
    pub watch_code: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMsg {
    Welcome {
        /// The seat taken; `None` for a watcher.
        seat: Option<usize>,
        /// The pseudonym given to this seat.
        name: Option<String>,
        /// Kept by the client to come back after a dropped connection.
        token: Option<String>,
    },
    Lobby(LobbyView),
    View(ClassView),
    /// Only to the seat whose creature it is.
    Offer(RaceOffer),
    /// Only to the seat that answered.
    Verdict(RaceVerdict),
    /// Wrapped so its own `type` tag stays as it is.
    Event {
        event: ClassEvent,
    },
    Cheer {
        at_ms: f64,
    },
    Recap(ClassRecap),
    /// The match is stored; nothing more will change.
    MatchCommitted {
        match_id: String,
    },
    Error {
        code: &'static str,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_messages_read_from_json() {
        let m: ClientMsg = serde_json::from_str(r#"{"type":"hello","code":"K7QW2M"}"#).unwrap();
        assert_eq!(
            m,
            ClientMsg::Hello {
                code: "K7QW2M".into(),
                resume: None,
                host: None,
            }
        );
        let m: ClientMsg =
            serde_json::from_str(r#"{"type":"answer_orb","offer_id":3,"crystals":[0,2]}"#).unwrap();
        assert_eq!(
            m,
            ClientMsg::AnswerOrb {
                offer_id: 3,
                crystals: vec![0, 2]
            }
        );
        assert!(serde_json::from_str::<ClientMsg>(r#"{"type":"grant_points"}"#).is_err());
    }

    #[test]
    fn events_keep_their_own_tag() {
        let s = serde_json::to_value(ServerMsg::Event {
            event: ClassEvent::MatchEnd { at_ms: 5.0 },
        })
        .unwrap();
        assert_eq!(
            s,
            serde_json::json!({"type": "event", "event": {"type": "match_end", "at_ms": 5.0}})
        );
        let s = serde_json::to_value(ServerMsg::Error { code: "room_full" }).unwrap();
        assert_eq!(s, serde_json::json!({"type": "error", "code": "room_full"}));
    }
}
