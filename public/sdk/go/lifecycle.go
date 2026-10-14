package ftai

import (
 "bufio"
 "context"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "os"
 "os/exec"
 "strings"
 "sync"
)
// Lifecycle runs the full shared Node engine with private pipes. Keep one instance per identity.
type Lifecycle struct { cmd *exec.Cmd; in io.WriteCloser; out *bufio.Reader; mu sync.Mutex; writes sync.Mutex; Identity json.RawMessage }
type LifecycleError struct { Detail json.RawMessage }
func(e *LifecycleError)Error()string{return "FTAI lifecycle: "+string(e.Detail)}
func NewLifecycle(bridge string, config any)(*Lifecycle,error){
 cmd:=exec.Command("node",bridge);cmd.Stderr=os.Stderr
 in,e:=cmd.StdinPipe();if e!=nil{return nil,e};out,e:=cmd.StdoutPipe();if e!=nil{return nil,e}
 if e=cmd.Start();e!=nil{return nil,e};l:=&Lifecycle{cmd:cmd,in:in,out:bufio.NewReader(out)}
 l.Identity,e=l.Call("init",config);if e!=nil{cmd.Process.Kill();cmd.Wait();return nil,e};return l,nil
}
func(l *Lifecycle)send(v any)error{l.writes.Lock();defer l.writes.Unlock();b,e:=json.Marshal(v);if e!=nil{return e};_,e=l.in.Write(append(b,'\n'));return e}
func(l *Lifecycle)Call(method string,args ...any)(json.RawMessage,error){return l.call(method,args,nil)}
func(l *Lifecycle)RunTask(task any,authorized bool,execute func(context.Context,json.RawMessage)(any,error))(json.RawMessage,error){m:="runTask";if authorized{m="runAuthorizedTask"};return l.call(m,[]any{task},execute)}
func(l *Lifecycle)call(method string,args []any,execute func(context.Context,json.RawMessage)(any,error))(json.RawMessage,error){
 l.mu.Lock();defer l.mu.Unlock();if args==nil{args=[]any{}}
 if e:=l.send(map[string]any{"method":method,"args":args});e!=nil{return nil,e}
 ctx,cancel:=context.WithCancel(context.Background());defer cancel()
 for{line,e:=l.out.ReadString('\n');if e!=nil{return nil,e};parts:=strings.SplitN(strings.TrimSuffix(line,"\n"),"\t",2);if len(parts)!=2{return nil,errors.New("invalid bridge message")};data:=json.RawMessage(parts[1])
 switch parts[0]{case "R":return data,nil;case "E":return nil,&LifecycleError{data};case "A":cancel();case "X":
  if execute==nil{l.send(map[string]any{"method":"callback","error":true});continue}
  go func(d json.RawMessage){defer func(){if recover()!=nil{l.send(map[string]any{"method":"callback","error":true})}}();v,err:=execute(ctx,d);if err!=nil{l.send(map[string]any{"method":"callback","error":true})}else if err=l.send(map[string]any{"method":"callback","result":v});err!=nil{l.send(map[string]any{"method":"callback","error":true})}}(data)
 default:return nil,fmt.Errorf("unknown bridge frame %q",parts[0])}
 }
}
func(l *Lifecycle)Close()error{_,e:=l.Call("close");l.in.Close();wait:=l.cmd.Wait();if e!=nil{return e};return wait}
