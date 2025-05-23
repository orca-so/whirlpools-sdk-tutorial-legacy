import {
  Keypair, Connection, PublicKey,
  TransactionMessage, VersionedTransaction
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, AccountLayout, getAssociatedTokenAddressSync,
  createTransferCheckedInstruction
} from "@solana/spl-token";
import { resolveOrCreateATA, ZERO } from "@orca-so/common-sdk";
import secret from "../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // RPC에 연결을 초기화하고 개인키를 로딩
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  // devSAMO
  // https://everlastingsong.github.io/nebula/
  const DEV_SAMO_MINT = new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa");
  const DEV_SAMO_DECIMALS = 9;

  // devSAMO를 전송할 대상 지갑
  const dest_pubkey = new PublicKey("vQW71yo6X1FjTwt9gaWtHYeoGMu7W9ehSmNiib7oW5G");

  // 전송할 수량
  const amount = 1_000_000_000; // 1 devSAMO

  // 송신자의 연관 토큰 계정을 가져옴
  const src_token_account = getAssociatedTokenAddressSync(DEV_SAMO_MINT, keypair.publicKey);

  // 수신자의 연관 토큰 계정을 가져옴 (계정이 없으면 create_ata_ix에 계정 생성 명령이 포함됩니다)
  const { address: dest_token_account, ...create_ata_ix } = await resolveOrCreateATA(
    connection,
    dest_pubkey,
    DEV_SAMO_MINT,
    () => connection.getMinimumBalanceForRentExemption(AccountLayout.span),
    ZERO,
    keypair.publicKey
  );

  // devSAMO를 전송하기 위한 명령을 생성
  const transfer_ix = createTransferCheckedInstruction(
    src_token_account,
    DEV_SAMO_MINT,
    dest_token_account,
    keypair.publicKey,
    amount,
    DEV_SAMO_DECIMALS,
    [],
    TOKEN_PROGRAM_ID
  );

  // 트랜잭션을 생성하고 명령을 추가
  const messageV0 = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    // 필요 시 수신자의 연관 토큰 계정을 생성
    instructions: [...create_ata_ix.instructions, transfer_ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(messageV0);
  tx.sign([keypair]);

  // 트랜잭션 전파
  const signature = await connection.sendTransaction(tx);
  console.log("signature:", signature);

  // 트랜잭션이 반영될 때 까지 대기
  const latest_blockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest_blockhash });
}

main();
