import json, os, sys, uuid
sys.path.insert(0, os.path.abspath('public/sdk/python'))
from lifecycle import Lifecycle, LifecycleError
config=json.loads(os.environ['FTAI_LIFECYCLE_CONFIG'])
bridge=os.path.abspath('public/sdk/lifecycle-bridge.mjs')
with Lifecycle(bridge,config) as c:
    code=c.identity['code']
    assert c.call('me')['agent']['code']==code
    c.call('flushOutcomes')
    task={'taskId':str(uuid.uuid4()),'title':'Python lifecycle check','action':'qa.task'}
    def work(context,cancelled):
        assert not cancelled.is_set()
        assert context['passportCode']==code
        return {'language':'python'}
    assert c.run_task(task,work)=={'language':'python'}
    try: c.run_task(task,work); raise AssertionError('Duplicate executed')
    except LifecycleError: pass
    task['taskId']=str(uuid.uuid4());task['action']='forbidden'
    try: c.run_task(task,lambda *_: (_ for _ in ()).throw(AssertionError('Denied callback executed')));raise AssertionError('Denied task passed')
    except LifecycleError: pass
with Lifecycle(bridge,{**config,'deferInit':True}) as c:
    assert c.identity['initialized'] is False
    try: c.call('me'); raise AssertionError('Deferred client accepted work')
    except LifecycleError: pass
    assert c.call('init')['code']==code

print('PASS Python lifecycle enrollment, execution, denial, duplicate prevention and restart')
