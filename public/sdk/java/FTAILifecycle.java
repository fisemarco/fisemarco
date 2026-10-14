import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

/** Full shared Node lifecycle through private local pipes. JSON arguments are supplied by the application's serializer. */
public final class FTAILifecycle implements AutoCloseable {
  public interface Task { String execute(String contextJson, AtomicBoolean cancelled) throws Exception; }
  private final Process process;
  private final BufferedWriter input;
  private final BufferedReader output;
  public final String identity;
  public FTAILifecycle(String bridgePath, String configJson) throws Exception {
    process = new ProcessBuilder("node",bridgePath).redirectError(ProcessBuilder.Redirect.INHERIT).start();
    input = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(),StandardCharsets.UTF_8));
    output = new BufferedReader(new InputStreamReader(process.getInputStream(),StandardCharsets.UTF_8));
    String result;
    try { result=call("init","["+configJson+"]"); } catch(Exception e) { process.destroy(); throw e; }
    identity=result;
  }
  private synchronized void send(String json) throws IOException { input.write(json); input.newLine(); input.flush(); }
  public String call(String method,String argsJson) throws Exception { return invoke(method,argsJson,null); }
  public String runTask(String taskJson,boolean authorized,Task task) throws Exception { return invoke(authorized?"runAuthorizedTask":"runTask","["+taskJson+"]",task); }
  private final Object calls=new Object();
  private String invoke(String method,String argsJson,Task task) throws Exception {
    if(!method.matches("[A-Za-z]+"))throw new IllegalArgumentException("Invalid lifecycle operation");
    synchronized(calls) {
      send("{\"method\":\""+method+"\",\"args\":"+argsJson+"}");
      AtomicBoolean cancelled=new AtomicBoolean(false);
      try {
        while(true) {
          String line=output.readLine(); if(line==null)throw new EOFException("FTAI bridge disconnected; stop work");
          if(line.length()<2||line.charAt(1)!='\t')throw new IOException("Invalid bridge frame");
          String value=line.substring(2);
          switch(line.charAt(0)) {
            case 'R': return value;
            case 'E': throw new IOException("FTAI lifecycle: "+value);
            case 'A': cancelled.set(true); break;
            case 'X':
              Thread worker=new Thread(()->{try{if(task==null)throw new IOException("Task callback required");String result=task.execute(value,cancelled);send("{\"method\":\"callback\",\"result\":"+result+"}");}catch(Exception e){try{send("{\"method\":\"callback\",\"error\":true}");}catch(IOException ignored){cancelled.set(true);}}},"ftai-task");
              worker.setDaemon(true);worker.start();break;
            default: throw new IOException("Unknown bridge frame");
          }
        }
      } finally { cancelled.set(true); }
    }
  }
  public void close() throws Exception { try{call("close","[]");}finally{input.close();output.close();if(!process.waitFor(10,java.util.concurrent.TimeUnit.SECONDS))process.destroyForcibly();} }
}
