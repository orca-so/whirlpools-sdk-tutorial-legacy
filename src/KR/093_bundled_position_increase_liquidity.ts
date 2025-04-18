import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, increaseLiquidityQuoteByInputTokenWithParams, IGNORE_CACHE, PositionBundleUtil,
  TokenExtensionUtil
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil, Percentage, TransactionBuilder } from "@orca-so/common-sdk";
import Decimal from "decimal.js";

// 스크립트 실행 전 환경변수 설정
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION_BUNDLE=address_of_position_bundle

async function main() {
  // WhirlpoolClient 생성
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // 토큰 정의
  // devToken specification
  // https://everlastingsong.github.io/nebula/
  const devUSDC = {mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6};
  const devSAMO = {mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9};

  // 환경변수 WHIRLPOOL_POSITION_BUNDLE에서 PositionBundle 주소를 가져옴
  const position_bundle_address = process.env.WHIRLPOOL_POSITION_BUNDLE;
  const position_bundle_pubkey = new PublicKey(position_bundle_address);
  console.log("position bundle address:", position_bundle_pubkey.toBase58());

  // PositionBundle 계정 조회
  const position_bundle = await ctx.fetcher.getPositionBundle(position_bundle_pubkey, IGNORE_CACHE);

  // PositionBundle 내에서 사용 중인 bundle index 조회
  const occupied_bundle_indexes = PositionBundleUtil.getOccupiedBundleIndexes(position_bundle);
  console.log("occupied bundle indexes (first 10):", occupied_bundle_indexes.slice(0, 10));

  // PositionBundle에서 관리하는 포지션 주소 2개 가져옴
  const bundled_position_one_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, occupied_bundle_indexes[0]);
  const bundled_position_two_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, occupied_bundle_indexes[1]);
  console.log(`bundled position one (${occupied_bundle_indexes[0]}) pubkey:`, bundled_position_one_pda.publicKey.toBase58());
  console.log(`bundled position two (${occupied_bundle_indexes[1]}) pubkey:`, bundled_position_two_pda.publicKey.toBase58());

  // 포지션과 해당 포지션이 속한 풀 조회
  const position_one = await client.getPosition(bundled_position_one_pda.publicKey);
  const whirlpool_one = await client.getPool(position_one.getData().whirlpool);
  const position_two = await client.getPosition(bundled_position_two_pda.publicKey);
  const whirlpool_two = await client.getPool(position_two.getData().whirlpool);

  // 예치할 토큰 수량과 허용 슬리피지 설정
  const dev_usdc_amount_one = DecimalUtil.toBN(new Decimal("1" /* devUSDC */), devUSDC.decimals);
  const dev_usdc_amount_two = DecimalUtil.toBN(new Decimal("2" /* devUSDC */), devUSDC.decimals);
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  // 예치 예상치 계산
  const whirlpool_data_one = whirlpool_one.getData();
  const token_a_one = whirlpool_one.getTokenAInfo();
  const token_b_one = whirlpool_one.getTokenBInfo();
  const quote_one = increaseLiquidityQuoteByInputTokenWithParams({
    tokenMintA: token_a_one.mint,
    tokenMintB: token_b_one.mint,
    sqrtPrice: whirlpool_data_one.sqrtPrice,
    tickCurrentIndex: whirlpool_data_one.tickCurrentIndex,
    tickLowerIndex: position_one.getData().tickLowerIndex,
    tickUpperIndex: position_one.getData().tickUpperIndex,
    inputTokenMint: devUSDC.mint,
    inputTokenAmount: dev_usdc_amount_one,
    slippageTolerance: slippage,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data_one),
  });

  const whirlpool_data_two = whirlpool_two.getData();
  const token_a_two = whirlpool_two.getTokenAInfo();
  const token_b_two = whirlpool_two.getTokenBInfo();
  const quote_two = increaseLiquidityQuoteByInputTokenWithParams({
    tokenMintA: token_a_two.mint,
    tokenMintB: token_b_two.mint,
    sqrtPrice: whirlpool_data_two.sqrtPrice,
    tickCurrentIndex: whirlpool_data_two.tickCurrentIndex,
    tickLowerIndex: position_two.getData().tickLowerIndex,
    tickUpperIndex: position_two.getData().tickUpperIndex,
    inputTokenMint: devUSDC.mint,
    inputTokenAmount: dev_usdc_amount_two,
    slippageTolerance: slippage,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data_two),
  });

  // 예상 결과 출력
  console.log("devSAMO max input one:", DecimalUtil.fromBN(quote_one.tokenMaxA, token_a_one.decimals).toFixed(token_a_one.decimals));
  console.log("devUSDC max input one:", DecimalUtil.fromBN(quote_one.tokenMaxB, token_b_one.decimals).toFixed(token_b_one.decimals));
  console.log("devSAMO max input two:", DecimalUtil.fromBN(quote_two.tokenMaxA, token_a_two.decimals).toFixed(token_a_two.decimals));
  console.log("devUSDC max input two:", DecimalUtil.fromBN(quote_two.tokenMaxB, token_b_two.decimals).toFixed(token_b_two.decimals));

  // 트랜잭션 실행 전 유동성 출력
  console.log("liquidity(before) one:", position_one.getData().liquidity.toString());
  console.log("liquidity(before) two:", position_two.getData().liquidity.toString());

  // 트랜잭션 생성 (BundledPosition도 생성 후 일반 포지션과 동일하게 조작 가능)
  const increase_liquidity_tx_one = await position_one.increaseLiquidity(quote_one);
  const increase_liquidity_tx_two = await position_two.increaseLiquidity(quote_two);

  // 트랜잭션 구성하고 명령 추가
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  tx_builder
    .addInstruction(increase_liquidity_tx_one.compressIx(true))
    .addInstruction(increase_liquidity_tx_two.compressIx(true));

  // 트랜잭션 전파파
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  // 트랜잭션 반영까지 대기함
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");

  // 트랜잭션 실행 후 유동성 출력
  console.log("liquidity(after) one:", (await position_one.refreshData()).liquidity.toString());
  console.log("liquidity(after) two:", (await position_two.refreshData()).liquidity.toString());
}

main();
