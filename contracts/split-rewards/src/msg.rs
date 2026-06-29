use cosmwasm_std::Uint128;
use serde::{Deserialize, Serialize};

/// Instantiate: configure the protocol fee and treasurer address.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct InstantiateMsg {
    /// Protocol service fee in basis points (500 = 5%). Must be 0..=10000.
    pub protocol_fee_bps: u16,
    /// Address that receives the protocol fee (treasurer).
    pub protocol_addr: String,
}

/// One recipient with a weight expressed in basis points (0..=10000).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct WeightRecipient {
    pub addr: String,
    pub weight_bps: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
    /// Atomically distribute the attached `funds` (for `denom`) to `recipients`
    /// according to their `weight_bps`, after deducting the protocol fee.
    Distribute {
        recipients: Vec<WeightRecipient>,
        denom: String,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    /// Returns the current Config.
    Config {},
    /// Returns the most recent Distribute record (audit).
    LastDistribution {},
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ConfigResponse {
    pub protocol_fee_bps: u16,
    pub protocol_addr: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct RecipientShareResponse {
    pub addr: String,
    pub weight_bps: u32,
    pub amount: Uint128,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct LastDistributionResponse {
    pub sender: String,
    pub total_amount: Uint128,
    pub protocol_fee: Uint128,
    pub denom: String,
    pub recipients: Vec<RecipientShareResponse>,
    pub height: u64,
    pub time: u64,
}
