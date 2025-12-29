import React from 'react';
import { AgentStatus } from '../types';

interface StatusBadgeProps {
  status: AgentStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  let colorClass = "bg-gray-500";
  let pulse = false;

  switch (status) {
    case AgentStatus.IDLE:
      colorClass = "bg-gray-500";
      break;
    case AgentStatus.THINKING:
      colorClass = "bg-yellow-500";
      pulse = true;
      break;
    case AgentStatus.DONE:
      colorClass = "bg-green-500";
      break;
    case AgentStatus.ERROR:
      colorClass = "bg-red-500";
      break;
  }

  return (
    <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-vs-border bg-opacity-40">
      <div className={`w-2.5 h-2.5 rounded-full ${colorClass} ${pulse ? 'animate-pulse' : ''}`}></div>
      <span className="text-xs font-medium text-vs-fg opacity-90 uppercase tracking-wide">
        Agent: {status}
      </span>
    </div>
  );
};