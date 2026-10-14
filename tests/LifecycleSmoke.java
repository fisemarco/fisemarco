import java.util.UUID;
public class LifecycleSmoke {
 public static void main(String[] args) throws Exception {
  String config=System.getenv("FTAI_LIFECYCLE_CONFIG"), bridge=System.getenv("FTAI_LIFECYCLE_BRIDGE"), original;
  int[] calls={0};
  try(FTAILifecycle c=new FTAILifecycle(bridge,config)) {
   original=c.identity;
   String task="{\"taskId\":\""+UUID.randomUUID()+"\",\"title\":\"Java lifecycle check\",\"action\":\"qa.task\"}";
   FTAILifecycle.Task work=(ctx,cancelled)->{if(cancelled.get())throw new AssertionError("Cancelled before start");calls[0]++;return "{\"language\":\"java\"}";};
   if(!c.runTask(task,false,work).contains("java"))throw new AssertionError();
   try{c.runTask(task,false,work);throw new AssertionError("Duplicate accepted");}catch(java.io.IOException expected){}
   task="{\"taskId\":\""+UUID.randomUUID()+"\",\"title\":\"Denied\",\"action\":\"forbidden\"}";
   try{c.runTask(task,false,work);throw new AssertionError("Denied task accepted");}catch(java.io.IOException expected){}
   if(calls[0]!=1)throw new AssertionError("Wrong callback count");
  }
  try(FTAILifecycle c=new FTAILifecycle(bridge,config)){if(!c.identity.equals(original))throw new AssertionError("Identity changed");}
  System.out.println("PASS Java lifecycle enrollment, execution, denial, duplicate prevention and restart");
 }
}
