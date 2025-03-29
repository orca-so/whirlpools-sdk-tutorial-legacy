import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, IGNORE_CACHE, PositionBundleUtil, decreaseLiquidityQuoteByLiquidityWithParams,
  TokenExtensionUtil
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil, Percentage, TransactionBuilder } from "@orca-so/common-sdk";
import { BN } from "bn.js";

//LANG:JP スクリプト実行前に環境変数定義が必要です
//LANG:EN Environment variables must be defined before script execution
//LANG:KR 스크립트 실행 전 환경변수 설정
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION_BUNDLE=address_of_position_bundle

async function main() {
  //LANG:JP WhirlpoolClient 作成
  //LANG:EN Create WhirlpoolClient
  //LANG:KR WhirlpoolClient 생성
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  //LANG:JP トークン定義
  //LANG:EN Token definition
  //LANG:KR 토큰 정의
  // devToken specification
  // https://everlastingsong.github.io/nebula/
  const devUSDC = {mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6};
  const devSAMO = {mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9};

  //LANG:JP 環境変数 WHIRLPOOL_POSITION_BUNDLE から PositionBundle のアドレスを読み込み
  //LANG:EN Retrieve the position bundle address from the WHIRLPOOL_POSITION_BUNDLE environment variable
  //LANG:KR 환경변수 WHIRLPOOL_POSITION_BUNDLE에서 PositionBundle 주소 가져옴
  const position_bundle_address = process.env.WHIRLPOOL_POSITION_BUNDLE;
  const position_bundle_pubkey = new PublicKey(position_bundle_address);
  console.log("position bundle address:", position_bundle_pubkey.toBase58());

  //LANG:JP PositionBundle アカウントを取得
  //LANG:EN Get PositionBundle account
  //LANG:KR PositionBundle 계정 조회
  const position_bundle = await ctx.fetcher.getPositionBundle(position_bundle_pubkey, IGNORE_CACHE);

  //LANG:JP PositionBundle における使用中の bundle index を取得
  //LANG:EN Get the bundle index in use in PositionBundle
  //LANG:KR PositionBundle에서 사용 중인 bundle index 조회
  const occupied_bundle_indexes = PositionBundleUtil.getOccupiedBundleIndexes(position_bundle);
  console.log("occupied bundle indexes (first 10):", occupied_bundle_indexes.slice(0, 10));

  //LANG:JP PositionBundle で管理するポジションのアドレスを 2 個取得
  //LANG:EN Get two addresses of positions managed by PositionBundle
  //LANG:KR PositionBundle에서 관리 중인 포지션 주소 2개 가져옴
  const bundled_position_one_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, occupied_bundle_indexes[0]);
  const bundled_position_two_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, occupied_bundle_indexes[1]);
  console.log(`bundled position one (${occupied_bundle_indexes[0]}) pubkey:`, bundled_position_one_pda.publicKey.toBase58());
  console.log(`bundled position two (${occupied_bundle_indexes[1]}) pubkey:`, bundled_position_two_pda.publicKey.toBase58());

  //LANG:JP ポジション・プール取得
  //LANG:EN Get the positions and the pools to which the positions belong
  //LANG:KR 포지션과 해당 포지션이 속한 풀 조회
  const position_one = await client.getPosition(bundled_position_one_pda.publicKey);
  const whirlpool_one = await client.getPool(position_one.getData().whirlpool);
  const position_two = await client.getPosition(bundled_position_two_pda.publicKey);
  const whirlpool_two = await client.getPool(position_two.getData().whirlpool);

  //LANG:JP 引き出す流動性を割合で指定 (30%)
  //LANG:EN Set the percentage of liquidity to be withdrawn (30%)
  //LANG:KR 인출할 유동성을 비율로 지정 (30%)
  const liquidity_one = position_one.getData().liquidity;
  const delta_liquidity_one = liquidity_one.mul(new BN(30)).div(new BN(100));
  const liquidity_two = position_two.getData().liquidity;
  const delta_liquidity_two = liquidity_two.mul(new BN(30)).div(new BN(100));

  console.log("liquidity one:", liquidity_one.toString());
  console.log("delta_liquidity one:", delta_liquidity_one.toString());
  console.log("liquidity two:", liquidity_two.toString());
  console.log("delta_liquidity two:", delta_liquidity_two.toString());

  //LANG:JP 許容するスリッページを設定
  //LANG:EN Set acceptable slippage
  //LANG:KR 허용 슬리피지 설정
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  //LANG:JP 見積もりを取得
  //LANG:EN Obtain withdraw estimation
  //LANG:KR 출금 예상치 가져옴
  const whirlpool_data_one = whirlpool_one.getData();
  const token_a_one = whirlpool_one.getTokenAInfo();
  const token_b_one = whirlpool_one.getTokenBInfo();
  const quote_one = decreaseLiquidityQuoteByLiquidityWithParams({
    sqrtPrice: whirlpool_data_one.sqrtPrice,
    tickCurrentIndex: whirlpool_data_one.tickCurrentIndex,
    tickLowerIndex: position_one.getData().tickLowerIndex,
    tickUpperIndex: position_one.getData().tickUpperIndex,
    liquidity: delta_liquidity_one,
    slippageTolerance: slippage,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data_one),
  });

  const whirlpool_data_two = whirlpool_two.getData();
  const token_a_two = whirlpool_two.getTokenAInfo();
  const token_b_two = whirlpool_two.getTokenBInfo();
  const quote_two = decreaseLiquidityQuoteByLiquidityWithParams({
    sqrtPrice: whirlpool_data_two.sqrtPrice,
    tickCurrentIndex: whirlpool_data_two.tickCurrentIndex,
    tickLowerIndex: position_two.getData().tickLowerIndex,
    tickUpperIndex: position_two.getData().tickUpperIndex,
    liquidity: delta_liquidity_two,
    slippageTolerance: slippage,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data_two),
  });

  //LANG:JP 見積もり結果表示
  //LANG:EN Output the estimation
  //LANG:KR 예상 결과 출력
  console.log("devSAMO min output one:", DecimalUtil.fromBN(quote_one.tokenMinA, token_a_one.decimals).toFixed(token_a_one.decimals));
  console.log("devUSDC min output one:", DecimalUtil.fromBN(quote_one.tokenMinB, token_b_one.decimals).toFixed(token_b_one.decimals));
  console.log("devSAMO min output two:", DecimalUtil.fromBN(quote_two.tokenMinA, token_a_two.decimals).toFixed(token_a_two.decimals));
  console.log("devUSDC min output two:", DecimalUtil.fromBN(quote_two.tokenMinB, token_b_two.decimals).toFixed(token_b_two.decimals));

  //LANG:JP トランザクション実行前の流動性を表示
  //LANG:EN Output the liquidity before transaction execution
  //LANG:KR 트랜잭션 실행 전 유동성 출력
  console.log("liquidity(before) one:", position_one.getData().liquidity.toString());
  console.log("liquidity(before) two:", position_two.getData().liquidity.toString());

  //LANG:JP トランザクションを作成 (BundledPosition も作成後は通常のポジションと同じ方法で操作可能)
  //LANG:EN Create a transaction (After opening BundledPosition, it can be operated in the same way as a normal position)
  //LANG:KR 트랜잭션 생성 (BundledPosition 생성 후에는 일반 포지션처럼 조작 가능)
  const decrease_liquidity_tx_one = await position_one.decreaseLiquidity(quote_one);
  const decrease_liquidity_tx_two = await position_two.decreaseLiquidity(quote_two);

  //LANG:JP トランザクション組み立て
  //LANG:EN Create a transaction and add the instruction
  //LANG:KR 트랜잭션 구성하고 명령 추가
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  tx_builder
    .addInstruction(decrease_liquidity_tx_one.compressIx(true))
    .addInstruction(decrease_liquidity_tx_two.compressIx(true));

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  //LANG:KR 트랜잭션 전송
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  //LANG:KR 트랜잭션 완료 대기
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");

  //LANG:JP トランザクション実行後の流動性を表示
  //LANG:EN Output the liquidity after transaction execution
  //LANG:KR 트랜잭션 실행 후 유동성 출력
  console.log("liquidity(after) one:", (await position_one.refreshData()).liquidity.toString());
  console.log("liquidity(after) two:", (await position_two.refreshData()).liquidity.toString());
}

main();
