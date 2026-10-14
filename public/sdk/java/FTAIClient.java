import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

/** Java 17+ FTAI signed transport. JSON is supplied by the application's JSON library.
 * Key custody, enrollment and resource execution remain caller responsibilities. */
public final class FTAIClient {
  private final String base, code;
  private final PrivateKey key;
  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();
  public FTAIClient(String base, String code, byte[] pkcs8) throws GeneralSecurityException {
    URI u=URI.create(base);
    if (!("https".equals(u.getScheme()) || ("http".equals(u.getScheme()) && ("localhost".equals(u.getHost()) || "127.0.0.1".equals(u.getHost())))) || u.getHost()==null || u.getUserInfo()!=null || u.getQuery()!=null || u.getFragment()!=null || !(u.getPath().isEmpty() || u.getPath().equals("/"))) throw new IllegalArgumentException("Use an HTTPS origin");
    this.base=base.replaceAll("/$", ""); this.code=code;
    this.key=KeyFactory.getInstance("Ed25519").generatePrivate(new PKCS8EncodedKeySpec(pkcs8));
  }
  public String request(String method, String path, String json) throws Exception {
    if (!path.startsWith("/api/v1/") || path.contains("..") || path.contains("?") || path.contains("#")) throw new IllegalArgumentException("Use an exact API path");
    byte[] body=(method.equals("GET") ? "" : json==null ? "{}" : json).getBytes(StandardCharsets.UTF_8);
    String timestamp=Long.toString(Instant.now().getEpochSecond()),nonce=UUID.randomUUID().toString();
    String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
    String message=String.join("\n", "FTAI-Request-v1", base, code, method, path, timestamp, nonce, hash);
    Signature s=Signature.getInstance("Ed25519");s.initSign(key);s.update(message.getBytes(StandardCharsets.UTF_8));
    HttpRequest req=HttpRequest.newBuilder(URI.create(base+path)).timeout(Duration.ofSeconds(30)).header("Content-Type","application/json").header("X-FTAI-Agent",code).header("X-FTAI-Timestamp",timestamp).header("X-FTAI-Nonce",nonce).header("X-FTAI-Signature",Base64.getUrlEncoder().withoutPadding().encodeToString(s.sign())).method(method,HttpRequest.BodyPublishers.ofByteArray(body)).build();
    HttpResponse<java.io.InputStream> res=http.send(req,HttpResponse.BodyHandlers.ofInputStream());
    byte[] bytes;try(var stream=res.body()){bytes=stream.readNBytes(2_000_001);}
    if(bytes.length>2_000_000) throw new java.io.IOException("FTAI response exceeds limit");
    String result=new String(bytes,StandardCharsets.UTF_8);
    if(res.statusCode()<200 || res.statusCode()>=300) throw new java.io.IOException("FTAI HTTP "+res.statusCode()+": "+result.substring(0,Math.min(result.length(),4096)));
    return result;
  }
  public String me() throws Exception {return request("GET","/api/v1/runtime/me",null);}
  public String checkAuthority(String json) throws Exception {return request("POST","/api/v1/organisations/authorize",json);}
  public String delegate(String json) throws Exception {return request("POST","/api/v1/organisations/delegate",json);}
  public String requestApproval(String json) throws Exception {return request("POST","/api/v1/organisations/approval-request",json);}
  public String consumeApproval(String json) throws Exception {return request("POST","/api/v1/organisations/approval-consume",json);}
}
