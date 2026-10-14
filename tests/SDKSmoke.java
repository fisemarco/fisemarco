import java.util.Base64;
public class SDKSmoke {
 public static void main(String[] args) throws Exception {
  FTAIClient c=new FTAIClient(System.getenv("FTAI_SDK_TEST_URL"),"FTAI-AAAA-BBBB-CCCC",Base64.getDecoder().decode(System.getenv("FTAI_SDK_TEST_PKCS8")));
  if(!c.me().contains("\"verified\":true"))throw new AssertionError();
  if(!c.checkAuthority("{\"grant\":\"fixture\",\"request\":{\"action\":\"Åä漢字\"}}").contains("\"verified\":true"))throw new AssertionError();
  try{new FTAIClient("http://untrusted.example","x",new byte[0]);throw new AssertionError();}catch(IllegalArgumentException expected){}
  System.out.println("PASS Java Ed25519 request interoperability");
 }
}
