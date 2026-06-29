//! SwarmPay split-rewards contract (CosmWasm) for Injective.
//!
//! Receives a total reward plus a weighted recipient list, deducts a protocol
//! service fee to the treasurer, and atomically distributes the remainder to
//! each agent wallet by weight. Pure integer math — the last recipient absorbs
//! rounding error so the per-recipient amounts always sum to exactly `remainder`.

mod error;
mod msg;
mod state;

use cosmwasm_std::{
    coin, ensure, entry_point, from_json, to_json_binary, Addr, BankMsg, Deps, DepsMut, Env,
    MessageInfo, Response, StdResult, Uint128,
};

use crate::error::ContractError;
use crate::msg::{
    ConfigResponse, ExecuteMsg, InstantiateMsg, LastDistributionResponse, QueryMsg,
    RecipientShareResponse, WeightRecipient,
};
use crate::state::{Config, LastDistribution, RecipientShare, CONFIG, LAST_DISTRIBUTION};

const BPS_DENOM: u32 = 10_000;

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    ensure!(
        msg.protocol_fee_bps <= 10_000,
        ContractError::InvalidProtocolFeeBps(msg.protocol_fee_bps)
    );
    let protocol_addr = deps.api.addr_validate(&msg.protocol_addr)?;

    let cfg = Config {
        protocol_fee_bps: msg.protocol_fee_bps,
        protocol_addr,
    };
    CONFIG.save(deps.storage, &cfg)?;

    Ok(Response::new().add_attribute("action", "instantiate"))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::Distribute { recipients, denom } => {
            execute_distribute(deps, env, info, recipients, denom)
        }
    }
}

pub fn execute_distribute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    recipients: Vec<WeightRecipient>,
    denom: String,
) -> Result<Response, ContractError> {
    // --- validate funds -----------------------------------------------------
    let total = cw_utils_get_amount(&info.funds, &denom)
        .ok_or(ContractError::NoFundsProvided(denom.clone()))?;
    ensure!(!total.is_zero(), ContractError::NoFundsProvided(denom.clone()));

    // --- validate recipients ------------------------------------------------
    ensure!(!recipients.is_empty(), ContractError::EmptyRecipients);

    let cfg = CONFIG.load(deps.storage)?;

    // Validate + collect each recipient address, rejecting invalid weights.
    let mut resolved: Vec<(Addr, u32)> = Vec::with_capacity(recipients.len());
    let mut weight_sum: u32 = 0;
    for r in &recipients {
        ensure!(
            r.weight_bps <= 10_000,
            ContractError::InvalidWeight(r.weight_bps)
        );
        let addr = deps.api.addr_validate(&r.addr)?;
        weight_sum = weight_sum
            .checked_add(r.weight_bps)
            .ok_or(ContractError::WeightSumOverflow(u32::MAX))?;
        ensure!(
            weight_sum <= 10_000,
            ContractError::WeightSumOverflow(weight_sum)
        );
        resolved.push((addr, r.weight_bps));
    }

    // --- compute protocol fee + remainder ----------------------------------
    // fee = total * protocol_fee_bps / 10000  (integer; truncation toward zero)
    let fee = total.multiply_ratio(u128::from(cfg.protocol_fee_bps), u128::from(BPS_DENOM));
    let remainder = total.checked_sub(fee).map_err(|_| {
        ContractError::Std(cosmwasm_std::StdError::generic_err("total < fee"))
    })?;

    // --- distribute by weight, last absorbs rounding -----------------------
    let mut messages: Vec<BankMsg> = Vec::with_capacity(resolved.len() + 1);
    let mut shares: Vec<RecipientShare> = Vec::with_capacity(resolved.len());
    let mut distributed: Uint128 = Uint128::zero();
    let n = resolved.len();

    if fee > Uint128::zero() {
        messages.push(BankMsg::Send {
            to_address: cfg.protocol_addr.to_string(),
            amount: vec![coin(fee.u128(), denom.clone())],
        });
    }

    for (idx, (addr, weight_bps)) in resolved.iter().enumerate() {
        let share = if idx == n - 1 {
            // Last recipient absorbs the rounding error → exact accounting.
            remainder.checked_sub(distributed).unwrap_or_default()
        } else {
            remainder.multiply_ratio(u128::from(*weight_bps), u128::from(BPS_DENOM))
        };

        distributed = distributed
            .checked_add(share)
            .map_err(|_| {
                ContractError::Std(cosmwasm_std::StdError::generic_err("distribution overflow"))
            })?;

        if !share.is_zero() {
            messages.push(BankMsg::Send {
                to_address: addr.to_string(),
                amount: vec![coin(share.u128(), denom.clone())],
            });
        }

        shares.push(RecipientShare {
            addr: addr.clone(),
            weight_bps: *weight_bps,
            amount: share,
        });
    }

    // Exact accounting invariant: sum(shares) == remainder, and remainder + fee == total.
    debug_assert_eq!(distributed, remainder);

    // --- persist audit record ----------------------------------------------
    let record = LastDistribution {
        sender: info.sender.clone(),
        total_amount: total,
        protocol_fee: fee,
        denom: denom.clone(),
        recipients: shares,
        height: env.block.height,
        time: env.block.time.seconds(),
    };
    LAST_DISTRIBUTION.save(deps.storage, &record)?;

    let mut resp = Response::new()
        .add_attribute("action", "distribute")
        .add_attribute("denom", denom)
        .add_attribute("total", total.to_string())
        .add_attribute("protocol_fee", fee.to_string())
        .add_attribute("remainder", remainder.to_string())
        .add_attribute("recipients", n.to_string());
    for (i, m) in messages.iter().enumerate() {
        // Surface each scheduled bank send in the response for transparency.
        if let BankMsg::Send { to_address, amount } = m {
            let amt = amount
                .first()
                .map(|c| c.amount.to_string())
                .unwrap_or_else(|| "0".to_string());
            resp = resp.add_attribute(format!("send_{i}"), format!("{to_address}:{amt}"));
        }
    }
    resp = resp.add_messages(messages);
    Ok(resp)
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<cosmwasm_std::Binary> {
    match msg {
        QueryMsg::Config {} => {
            let cfg = CONFIG.load(deps.storage)?;
            let resp = ConfigResponse {
                protocol_fee_bps: cfg.protocol_fee_bps,
                protocol_addr: cfg.protocol_addr.to_string(),
            };
            Ok(to_json_binary(&resp)?)
        }
        QueryMsg::LastDistribution {} => {
            let last = LAST_DISTRIBUTION
                .load(deps.storage)
                .unwrap_or(LastDistribution {
                    sender: Addr::unchecked(""),
                    total_amount: Uint128::zero(),
                    protocol_fee: Uint128::zero(),
                    denom: String::new(),
                    recipients: vec![],
                    height: 0,
                    time: 0,
                });
            let resp = LastDistributionResponse {
                sender: last.sender.to_string(),
                total_amount: last.total_amount,
                protocol_fee: last.protocol_fee,
                denom: last.denom,
                recipients: last
                    .recipients
                    .into_iter()
                    .map(|r| RecipientShareResponse {
                        addr: r.addr.to_string(),
                        weight_bps: r.weight_bps,
                        amount: r.amount,
                    })
                    .collect(),
                height: last.height,
                time: last.time,
            };
            Ok(to_json_binary(&resp)?)
        }
    }
}

/// Look up the amount for `denom` within `funds`. None if not present.
fn cw_utils_get_amount(funds: &[cosmwasm_std::Coin], denom: &str) -> Option<Uint128> {
    funds.iter().find(|c| c.denom == denom).map(|c| c.amount)
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{message_info, mock_env, MockApi, MockQuerier, MockStorage};
    use cosmwasm_std::{coins, Addr, Coin, Empty, OwnedDeps, Uint128};
    use std::marker::PhantomData;

    const DENOM: &str = "inj";

    /// Build mock deps whose addr_validate accepts Injective's `inj` bech32 prefix.
    fn mock_deps() -> OwnedDeps<MockStorage, MockApi, MockQuerier, Empty> {
        OwnedDeps {
            storage: MockStorage::default(),
            api: MockApi::default().with_prefix("inj"),
            querier: MockQuerier::default(),
            custom_query_type: PhantomData::<Empty>,
        }
    }

    /// Encode a deterministic 20-byte body as a valid bech32 `inj` address so
    /// the mocked addr_validate checker (with `inj` prefix) accepts it.
    fn mk_addr(body: &[u8; 20]) -> String {
        use bech32::{encode, ToBase32, Variant};
        encode("inj", body.to_base32(), Variant::Bech32).expect("bech32 encode")
    }

    /// Address-role constants (computed at first use to stay bech32-valid).
    fn protocol_addr() -> String {
        mk_addr(&[0u8; 20])
    }
    fn agent_addr(tag: u8) -> String {
        let mut body = [0u8; 20];
        body[0] = tag;
        mk_addr(&body)
    }
    fn agent_a() -> String {
        agent_addr(1)
    }
    fn agent_b() -> String {
        agent_addr(2)
    }
    fn agent_c() -> String {
        agent_addr(3)
    }
    fn agent_d() -> String {
        agent_addr(4)
    }
    fn agent_e() -> String {
        agent_addr(5)
    }
    fn agent_f() -> String {
        agent_addr(6)
    }
    fn agent_g() -> String {
        agent_addr(7)
    }

    fn do_instantiate(
        deps: DepsMut,
        protocol_fee_bps: u16,
        protocol_addr: &str,
    ) -> Result<Response, ContractError> {
        let msg = InstantiateMsg {
            protocol_fee_bps,
            protocol_addr: protocol_addr.to_string(),
        };
        let info = message_info(&Addr::unchecked("deployer"), &[]);
        instantiate(deps, mock_env(), info, msg)
    }

    fn distribute(
        deps: DepsMut,
        sender: &str,
        total: u128,
        recipients: Vec<WeightRecipient>,
    ) -> Result<Response, ContractError> {
        let info = message_info(&Addr::unchecked(sender), &coins(total, DENOM));
        execute(
            deps,
            mock_env(),
            info,
            ExecuteMsg::Distribute {
                recipients,
                denom: DENOM.to_string(),
            },
        )
    }

    /// Sum the per-recipient amounts recorded in LAST_DISTRIBUTION.
    fn sum_recipient_amounts(deps: Deps) -> Uint128 {
        let last: crate::state::LastDistribution =
            LAST_DISTRIBUTION.load(deps.storage).unwrap();
        last.recipients.iter().map(|r| r.amount).sum()
    }

    // ---- instantiate ----

    #[test]
    fn instantiate_ok_and_queryable() {
        let mut deps = mock_deps();
        do_instantiate(deps.as_mut(), 500, &protocol_addr()).unwrap();

        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::Config {},
        )
        .unwrap();
        let cfg: ConfigResponse = from_json(res).unwrap();
        assert_eq!(cfg.protocol_fee_bps, 500);
        assert_eq!(cfg.protocol_addr, protocol_addr());
    }

    #[test]
    fn instantiate_rejects_fee_over_10000() {
        let mut deps = mock_deps();
        let err = do_instantiate(deps.as_mut(), 10_001, &protocol_addr()).unwrap_err();
        assert_eq!(err, ContractError::InvalidProtocolFeeBps(10_001));
    }

    #[test]
    fn instantiate_rejects_bad_address() {
        let mut deps = mock_deps();
        let err = do_instantiate(deps.as_mut(), 500, "not-a-valid-bech32").unwrap_err();
        assert!(matches!(err, ContractError::Std(_)));
    }

    // ---- happy path: weights sum to exactly 10000 ----

    #[test]
    fn distribute_equal_split_full_weights() {
        let mut deps = mock_deps();
        do_instantiate(deps.as_mut(), 500, &protocol_addr()).unwrap(); // 5% fee

        // 50/50 split, weights sum to 10000.
        let recipients = vec![
            WeightRecipient { addr: agent_a(), weight_bps: 5000 },
            WeightRecipient { addr: agent_b(), weight_bps: 5000 },
        ];
        // total = 1_000_000_000 (1e9) -> fee 5% = 50_000_000, remainder = 950_000_000
        let res = distribute(deps.as_mut(), "alice", 1_000_000_000, recipients).unwrap();

        // Protocol fee message + 2 recipient sends = 3 bank messages.
        assert_eq!(res.messages.len(), 3);

        let last = LAST_DISTRIBUTION.load(&deps.storage).unwrap();
        assert_eq!(last.total_amount, Uint128::new(1_000_000_000));
        assert_eq!(last.protocol_fee, Uint128::new(50_000_000));
        assert_eq!(last.recipients.len(), 2);
        // 50/50 of 950_000_000 = 475_000_000 each, no rounding needed.
        assert_eq!(last.recipients[0].amount, Uint128::new(475_000_000));
        assert_eq!(last.recipients[1].amount, Uint128::new(475_000_000));
        // Precision invariant: sum == remainder.
        assert_eq!(sum_recipient_amounts(deps.as_ref()), Uint128::new(950_000_000));
    }

    // ---- protocol fee deduction: zero fee ----

    #[test]
    fn distribute_zero_protocol_fee() {
        let mut deps = mock_deps();
        do_instantiate(deps.as_mut(), 0, &protocol_addr()).unwrap();

        let recipients = vec![
            WeightRecipient { addr: agent_a(), weight_bps: 1000 },
            WeightRecipient { addr: agent_b(), weight_bps: 3000 },
        ];
        let res = distribute(deps.as_mut(), "alice", 1_000_000, recipients).unwrap();
        // No fee → only 2 recipient sends (zero-fee skip optimisation).
        assert_eq!(res.messages.len(), 2);

        let last = LAST_DISTRIBUTION.load(&deps.storage).unwrap();
        assert_eq!(last.protocol_fee, Uint128::zero());
        assert_eq!(last.total_amount, Uint128::new(1_000_000));
        // remainder = 1_000_000; A = 100_000, B = 300_000, last absorbs 600_000.
        assert_eq!(last.recipients[0].amount, Uint128::new(100_000));
        assert_eq!(last.recipients[1].amount, Uint128::new(900_000));
        assert_eq!(sum_recipient_amounts(deps.as_ref()), Uint128::new(1_000_000));
    }

    // ---- rounding absorbed by last recipient (weights sum < 10000) ----

    #[test]
    fn distribute_last_absorbs_rounding() {
        let mut deps = mock_deps();
        do_instantiate(deps.as_mut(), 0, &protocol_addr()).unwrap();

        // Three-way split that does not divide evenly: 10000 total, weights 3333/3333/3334? no —
        // use weights that produce remainder. total = 1_000_000_003 (odd-ish) won't matter;
        // pick total = 10 and weights 1000/2000/3000 (sum 6000 < 10000), last absorbs leftover.
        let recipients = vec![
            WeightRecipient { addr: agent_a(), weight_bps: 1000 },
            WeightRecipient { addr: agent_b(), weight_bps: 2000 },
            WeightRecipient { addr: agent_c(), weight_bps: 3000 },
        ];
        // total = 10, no fee, remainder = 10
        // A = 10*1000/10000 = 1, B = 10*2000/10000 = 2, last = 10 - (1+2) = 7
        let _ = distribute(deps.as_mut(), "alice", 10, recipients).unwrap();

        let last = LAST_DISTRIBUTION.load(&deps.storage).unwrap();
        assert_eq!(last.recipients[0].amount, Uint128::new(1));
        assert_eq!(last.recipients[1].amount, Uint128::new(2));
        assert_eq!(last.recipients[2].amount, Uint128::new(7)); // absorbs 1+1 rounding
        assert_eq!(sum_recipient_amounts(deps.as_ref()), Uint128::new(10));
    }

    // ---- weights sum < 10000 with leftover (remainder not fully allocated by weights) ----

    #[test]
    fn distribute_weights_sum_less_than_10000_with_leftover() {
        let mut deps = mock_deps();
        do_instantiate(deps.as_mut(), 0, &protocol_addr()).unwrap();

        // weights 5000 total (of 10000). Remainder 1_000_000.
        // A=250_000 (5000*5000/10000? no: 1_000_000 * 1000 / 10000 = 100_000)
        let recipients = vec![
            WeightRecipient { addr: agent_a(), weight_bps: 1000 },
            WeightRecipient { addr: agent_b(), weight_bps: 4000 },
        ];
        let _ = distribute(deps.as_mut(), "alice", 1_000_000, recipients).unwrap();
        let last = LAST_DISTRIBUTION.load(&deps.storage).unwrap();
        // A = 100_000, B = 400_000, last absorbs 1_000_000 - 500_000 = 500_000
        assert_eq!(last.recipients[0].amount, Uint128::new(100_000));
        assert_eq!(last.recipients[1].amount, Uint128::new(900_000));
        assert_eq!(sum_recipient_amounts(deps.as_ref()), Uint128::new(1_000_000));
    }

    // ---- precision invariant under many recipients (no float drift) ----

    #[test]
    fn distribute_many_recipients_no_drift() {
        let mut deps = mock_deps();
        do_instantiate(deps.as_mut(), 333, &protocol_addr()).unwrap(); // 3.33% fee

        // 7 recipients with weights that don't divide evenly.
        let mut recipients = vec![
            WeightRecipient { addr: agent_a(), weight_bps: 1000 },
            WeightRecipient { addr: agent_b(), weight_bps: 1500 },
            WeightRecipient { addr: agent_c(), weight_bps: 2000 },
            WeightRecipient { addr: agent_d(), weight_bps: 500 },
            WeightRecipient { addr: agent_e(), weight_bps: 700 },
            WeightRecipient { addr: agent_f(), weight_bps: 800 },
            WeightRecipient { addr: agent_g(), weight_bps: 3500 },
        ];
        // sum weights = 10000 exactly.
        let sum: u32 = recipients.iter().map(|r| r.weight_bps).sum();
        assert_eq!(sum, 10000);

        // total = 123_456_789_012 (odd). fee = total*333/10000 = 4_111_110_968 (truncated).
        let total: u128 = 123_456_789_012;
        let _ = distribute(deps.as_mut(), "alice", total, recipients.clone()).unwrap();
        let last = LAST_DISTRIBUTION.load(&deps.storage).unwrap();

        let expected_fee = total * 333 / 10000;
        let remainder = total - expected_fee;
        assert_eq!(last.protocol_fee, Uint128::new(expected_fee));
        assert_eq!(last.total_amount, Uint128::new(total));
        // Critical invariant: sum of recipient amounts == remainder exactly.
        assert_eq!(sum_recipient_amounts(deps.as_ref()), Uint128::new(remainder));
        // And remainder + fee == total.
        assert_eq!(
            last.protocol_fee.u128() + sum_recipient_amounts(deps.as_ref()).u128(),
            total
        );
        let _ = &mut recipients; // silence unused_mut
    }

    // ---- empty recipients rejected ----

    #[test]
    fn distribute_empty_recipients_rejected() {
        let mut deps = mock_deps();
        do_instantiate(deps.as_mut(), 500, &protocol_addr()).unwrap();

        let err = distribute(deps.as_mut(), "alice", 1_000_000, vec![]).unwrap_err();
        assert_eq!(err, ContractError::EmptyRecipients);
    }

    // ---- no funds attached rejected ----

    #[test]
    fn distribute_no_funds_rejected() {
        let mut deps = mock_deps();
        do_instantiate(deps.as_mut(), 500, &protocol_addr()).unwrap();

        let info = message_info(&Addr::unchecked("alice"), &[]); // no coins
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::Distribute {
                recipients: vec![WeightRecipient {
                    addr: agent_a(),
                    weight_bps: 10000,
                }],
                denom: DENOM.to_string(),
            },
        )
        .unwrap_err();
        assert_eq!(err, ContractError::NoFundsProvided(DENOM.to_string()));
    }

    // ---- zero funds (explicit zero coin) rejected ----

    #[test]
    fn distribute_zero_amount_rejected() {
        let mut deps = mock_deps();
        do_instantiate(deps.as_mut(), 500, &protocol_addr()).unwrap();

        // Explicit zero-coin attached: still rejected (must provide actual funds).
        let info = message_info(&Addr::unchecked("alice"), &[Coin {
            denom: DENOM.to_string(),
            amount: Uint128::zero(),
        }]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::Distribute {
                recipients: vec![WeightRecipient {
                    addr: agent_a(),
                    weight_bps: 10000,
                }],
                denom: DENOM.to_string(),
            },
        )
        .unwrap_err();
        assert_eq!(err, ContractError::NoFundsProvided(DENOM.to_string()));
    }

    // ---- invalid weight (> 10000) rejected ----

    #[test]
    fn distribute_invalid_weight_rejected() {
        let mut deps = mock_deps();
        do_instantiate(deps.as_mut(), 500, &protocol_addr()).unwrap();

        let err = distribute(
            deps.as_mut(),
            "alice",
            1_000_000,
            vec![
                WeightRecipient { addr: agent_a(), weight_bps: 5000 },
                WeightRecipient { addr: agent_b(), weight_bps: 6000 },
            ],
        )
        .unwrap_err();
        // 6000 itself is valid, but running sum 5000+6000=11000 > 10000.
        assert_eq!(err, ContractError::WeightSumOverflow(11_000));
    }

    #[test]
    fn distribute_single_weight_over_10000_rejected() {
        let mut deps = mock_deps();
        do_instantiate(deps.as_mut(), 500, &protocol_addr()).unwrap();

        let err = distribute(
            deps.as_mut(),
            "alice",
            1_000_000,
            vec![WeightRecipient {
                addr: agent_a(),
                weight_bps: 10_001,
            }],
        )
        .unwrap_err();
        assert_eq!(err, ContractError::InvalidWeight(10_001));
    }

    // ---- zero-weight recipient handled gracefully ----

    #[test]
    fn distribute_zero_weight_recipient() {
        let mut deps = mock_deps();
        do_instantiate(deps.as_mut(), 0, &protocol_addr()).unwrap();

        let recipients = vec![
            WeightRecipient { addr: agent_a(), weight_bps: 0 },
            WeightRecipient { addr: agent_b(), weight_bps: 10000 },
        ];
        let _ = distribute(deps.as_mut(), "alice", 1_000_000, recipients).unwrap();
        let last = LAST_DISTRIBUTION.load(&deps.storage).unwrap();
        assert_eq!(last.recipients[0].amount, Uint128::zero());
        assert_eq!(last.recipients[1].amount, Uint128::new(1_000_000));
        assert_eq!(sum_recipient_amounts(deps.as_ref()), Uint128::new(1_000_000));
    }

    // ---- last_distribution query returns most recent record ----

    #[test]
    fn query_last_distribution_reflects_latest() {
        let mut deps = mock_deps();
        do_instantiate(deps.as_mut(), 500, &protocol_addr()).unwrap();

        // Before any distribution: returns a zero/empty record (no error).
        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::LastDistribution {},
        )
        .unwrap();
        let resp: LastDistributionResponse = from_json(res).unwrap();
        assert_eq!(resp.total_amount, Uint128::zero());
        assert!(resp.recipients.is_empty());

        // First distribute.
        let _ = distribute(
            deps.as_mut(),
            "alice",
            1_000_000,
            vec![
                WeightRecipient { addr: agent_a(), weight_bps: 5000 },
                WeightRecipient { addr: agent_b(), weight_bps: 5000 },
            ],
        )
        .unwrap();
        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::LastDistribution {},
        )
        .unwrap();
        let resp: LastDistributionResponse = from_json(res).unwrap();
        assert_eq!(resp.sender, "alice");
        assert_eq!(resp.total_amount, Uint128::new(1_000_000));
        assert_eq!(resp.recipients.len(), 2);
    }

    // ---- bank messages go to the right addresses with the right amounts ----

    #[test]
    fn distribute_bank_messages_correct() {
        let mut deps = mock_deps();
        do_instantiate(deps.as_mut(), 1000, &protocol_addr()).unwrap(); // 10% fee

        let recipients = vec![
            WeightRecipient { addr: agent_a(), weight_bps: 3000 },
            WeightRecipient { addr: agent_b(), weight_bps: 7000 },
        ];
        // total 1_000_000 → fee 100_000 → remainder 900_000
        // A = 900_000 * 3000 / 10000 = 270_000, B absorbs 630_000
        let res = distribute(deps.as_mut(), "alice", 1_000_000, recipients).unwrap();

        // Collect (addr, amount) from BankMsg::Send.
        let sends: Vec<(String, u128)> = res
            .messages
            .iter()
            .map(|m| {
                let cosmos_msg = m.msg.clone();
                if let cosmwasm_std::CosmosMsg::Bank(BankMsg::Send { to_address, amount }) =
                    cosmos_msg
                {
                    (to_address, amount[0].amount.u128())
                } else {
                    panic!("expected bank send");
                }
            })
            .collect();

        assert!(sends.iter().any(|(a, amt)| a == &protocol_addr() && *amt == 100_000));
        assert!(sends.iter().any(|(a, amt)| a == &agent_a() && *amt == 270_000));
        assert!(sends.iter().any(|(a, amt)| a == &agent_b() && *amt == 630_000));
    }
}
