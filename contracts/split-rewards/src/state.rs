use cosmwasm_std::{Addr, Uint128};
use cw_storage_plus::Item;
use serde::{Deserialize, Serialize};

/// Persisted contract configuration, set once at instantiate time.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Config {
    /// Protocol service fee in basis points (500 = 5%).
    pub protocol_fee_bps: u16,
    /// Address that receives the protocol fee (the treasurer).
    pub protocol_addr: Addr,
}

/// One recipient's resolved share from a single Distribute call.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct RecipientShare {
    pub addr: Addr,
    pub weight_bps: u32,
    /// Amount actually sent to this recipient (Uint128, integer — no float).
    pub amount: Uint128,
}

/// Audit record of the most recent Distribute call.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct LastDistribution {
    /// Who invoked Distribute (and attached the funds).
    pub sender: Addr,
    /// Total funds attached for `denom`.
    pub total_amount: Uint128,
    /// Protocol fee extracted (sent to protocol_addr).
    pub protocol_fee: Uint128,
    pub denom: String,
    /// Per-recipient weights and resolved amounts. Sum of `amount` == total - fee.
    pub recipients: Vec<RecipientShare>,
    pub height: u64,
    pub time: u64,
}

pub const CONFIG: Item<Config> = Item::new("config");
pub const LAST_DISTRIBUTION: Item<LastDistribution> = Item::new("last_distribution");
