package ftai
import("context";"encoding/json";"os";"testing";"crypto/rand";"fmt")
func TestLifecycle(t *testing.T){
 raw:=os.Getenv("FTAI_LIFECYCLE_CONFIG");if raw==""{t.Skip("integration config absent")}
 bridge:=os.Getenv("FTAI_LIFECYCLE_BRIDGE");var config any;if e:=json.Unmarshal([]byte(raw),&config);e!=nil{t.Fatal(e)}
 c,e:=NewLifecycle(bridge,config);if e!=nil{t.Fatal(e)};original:=string(c.Identity)
 id:=func()string{b:=make([]byte,16);rand.Read(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;return fmt.Sprintf("%x-%x-%x-%x-%x",b[:4],b[4:6],b[6:8],b[8:10],b[10:])}
 task:=map[string]any{"taskId":id(),"title":"Go lifecycle check","action":"qa.task"};calls:=0
 work:=func(ctx context.Context,data json.RawMessage)(any,error){if ctx.Err()!=nil{t.Error(ctx.Err())};calls++;return map[string]any{"language":"go"},nil}
 if _,e=c.RunTask(task,false,work);e!=nil{t.Fatal(e)}
 if _,e=c.RunTask(task,false,work);e==nil{t.Fatal("duplicate accepted")}
 task["taskId"]=id();task["action"]="forbidden"
 if _,e=c.RunTask(task,false,work);e==nil{t.Fatal("denied task accepted")};if calls!=1{t.Fatal("callback count",calls)}
 if e=c.Close();e!=nil{t.Fatal(e)};c,e=NewLifecycle(bridge,config);if e!=nil{t.Fatal(e)};defer c.Close();if string(c.Identity)!=original{t.Fatal("identity changed on restart")}
}
