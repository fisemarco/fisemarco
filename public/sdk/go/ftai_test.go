package ftai
import("context";"crypto/ed25519";"encoding/base64";"os";"testing";"bytes")
func TestSignedTransport(t *testing.T){
 base:=os.Getenv("FTAI_SDK_TEST_URL");if base==""{t.Skip("Set test fixture URL to exercise transport")}
 seed,e:=base64.StdEncoding.DecodeString(os.Getenv("FTAI_SDK_TEST_SEED"));if e!=nil{t.Fatal(e)}
 c,e:=New(base,"FTAI-AAAA-BBBB-CCCC",ed25519.NewKeyFromSeed(seed));if e!=nil{t.Fatal(e)}
 a,e:=c.Me(context.Background());if e!=nil||!bytes.Contains(a,[]byte(`"verified":true`)){t.Fatalf("me: %s %v",a,e)}
 a,e=c.CheckAuthority(context.Background(),"fixture",map[string]string{"action":"Åä漢字"});if e!=nil||!bytes.Contains(a,[]byte(`"verified":true`)){t.Fatalf("check: %s %v",a,e)}
 if _,e=New("http://untrusted.example","x",ed25519.NewKeyFromSeed(seed));e==nil{t.Fatal("insecure origin accepted")}
}
