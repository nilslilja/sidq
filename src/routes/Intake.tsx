import { useNavigate } from 'react-router-dom';
import { useSidq } from '@/state/SidqProvider';
import { IntakeStepper } from '@/components/intake/IntakeStepper';
import { Loader } from '@/components/ui/loader';
import type { IntakeAnswers } from '@/types/domain';

export function Intake() {
  const { completeIntake, phase } = useSidq();
  const navigate = useNavigate();

  if (phase === 'generating') {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <Loader />
      </div>
    );
  }

  const handleComplete = async (answers: IntakeAnswers) => {
    await completeIntake(answers);
    navigate('/today', { replace: true });
  };

  return <IntakeStepper onComplete={handleComplete} />;
}
