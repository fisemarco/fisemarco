"""Complete FTAI lifecycle through the shared Node 22+ engine; private local pipes only."""
import json
import subprocess
import threading

class LifecycleError(Exception):
    def __init__(self, detail):
        super().__init__(detail.get('message', 'FTAI lifecycle failed'))
        self.detail = detail

class Lifecycle:
    def __init__(self, bridge_path, config, node='node'):
        self.process = subprocess.Popen([node, bridge_path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        self.lock, self.write_lock = threading.Lock(), threading.Lock()
        try:
            self.identity = self.call('init', config)
        except BaseException:
            self.process.terminate()
            self.process.wait(timeout=5)
            self.process.stdin.close()
            self.process.stdout.close()
            raise

    def _send(self, value):
        with self.write_lock:
            self.process.stdin.write(json.dumps(value, ensure_ascii=False, allow_nan=False)+'\n')
            self.process.stdin.flush()

    def call(self, method, *args, execute=None):
        with self.lock:
            self._send({'method': method, 'args': list(args)})
            cancelled = threading.Event()
            worker = None
            while True:
                line = self.process.stdout.readline()
                if not line:
                    cancelled.set()
                    raise LifecycleError({'message':'FTAI bridge disconnected; stop work'})
                tag, value = line.rstrip('\n').split('\t', 1)
                data = json.loads(value)
                if tag == 'A': cancelled.set()
                elif tag == 'X':
                    def run(context=data):
                        try:
                            if execute is None: raise RuntimeError('Task callback required')
                            result = execute(context, cancelled)
                            self._send({'method':'callback','result':result})
                        except BaseException:
                            self._send({'method':'callback','error':True})
                    worker = threading.Thread(target=run, daemon=True)
                    worker.start()
                elif tag in ('R','E'):
                    if worker: worker.join()
                    if tag == 'E': raise LifecycleError(data)
                    return data

    def run_task(self, task, execute): return self.call('runTask', task, execute=execute)
    def run_authorized_task(self, task, execute): return self.call('runAuthorizedTask', task, execute=execute)
    def close(self):
        try: return self.call('close')
        finally:
            self.process.stdin.close()
            self.process.stdout.close()
            try: self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.terminate()
                self.process.wait(timeout=5)
    def __enter__(self): return self
    def __exit__(self, *_): self.close()
