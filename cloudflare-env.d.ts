declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    FTAI_SIGNING_JWK?: string;
    FTAI_ORIGIN?: string;
    BUCKET?: R2Bucket;
  }
}
