import { Check } from 'lucide-react';
import { WORKFLOW_STEPS, type WorkflowStep } from './types';

export function WorkflowStepper({ current }: { current: WorkflowStep }) {
  const currentIndex = WORKFLOW_STEPS.findIndex((step) => step.key === current);
  return <ol className="mb-8 grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-6" data-testid="workflow-stepper" aria-label="Sales workflow progress">
    {WORKFLOW_STEPS.map((step, index) => {
      const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
      return <li key={step.key} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${state === 'current' ? 'bg-primary/10' : ''}`} aria-current={state === 'current' ? 'step' : undefined} data-testid={`step-${step.key}-${state}`}>
        <span className={`flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold ${state === 'done' ? 'bg-[#39715e] text-white' : state === 'current' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}</span>
        <span className="min-w-0"><span className={`block truncate text-[12px] font-semibold ${state === 'todo' ? 'text-muted-foreground' : 'text-foreground'}`}>{step.label}</span><span className="block truncate text-[10px] text-muted-foreground">{step.hint}</span></span>
      </li>;
    })}
  </ol>;
}
