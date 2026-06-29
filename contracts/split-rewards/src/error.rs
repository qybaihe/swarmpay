use cosmwasm_std::StdError;
use thiserror::Error;

/// Custom contract errors. `Std` lets us use `?` on any cosmwasm-std fallible call.
#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("protocol_fee_bps {0} exceeds 10000")]
    InvalidProtocolFeeBps(u16),

    #[error("invalid weight_bps {0}: must be in 0..=10000")]
    InvalidWeight(u32),

    #[error("sum of weights {0} exceeds 10000")]
    WeightSumOverflow(u32),

    #[error("recipients list is empty")]
    EmptyRecipients,

    #[error("no funds provided for denom {0}")]
    NoFundsProvided(String),
}
