import { motion } from 'motion/react';
import { OrderRoutingDecision } from '../engine/OrderRoutingEngine';
import { RoutingPresentationEngine } from '../engine/RoutingPresentationEngine';
import { CheckCircle, Lock, Clock, AlertTriangle, Info, Users, ArrowRight } from 'lucide-react';

interface OrderRoutingPanelProps {
  decision: OrderRoutingDecision;
  onSelectAction: (actionType: string) => void;
  onCancel: () => void;
}

export default function OrderRoutingPanel({ decision, onSelectAction, onCancel }: OrderRoutingPanelProps) {
  const presentation = RoutingPresentationEngine.buildPresentation(decision);
  const { title: headline, description, availableActions, nextCommunityBatches } = presentation;
  const { mode } = decision;

  const renderIcon = (iconName: string) => {
    switch (iconName) {
      case 'check-circle': return <CheckCircle size={32} />;
      case 'lock': return <Lock size={32} />;
      case 'clock': return <Clock size={32} />;
      case 'alert-triangle': return <AlertTriangle size={32} />;
      case 'users': return <Users size={32} />;
      default: return <Info size={32} />;
    }
  };

  const getSeverityColors = (severity: string) => {
    switch (severity) {
      case 'success': return 'bg-heritage-green/10 text-heritage-green border-heritage-green/20';
      case 'warning': return 'bg-heritage-gold/10 text-heritage-gold border-heritage-gold/20';
      case 'error': return 'bg-red-50 text-red-600 border-red-100';
      case 'info':
      default: return 'bg-heritage-ink/5 text-heritage-ink border-heritage-ink/10';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden my-8"
      >
        {/* Header section driven by presentation model */}
        <div className={`p-8 md:p-10 border-b flex flex-col items-center text-center ${getSeverityColors((mode === 'COMMUNITY_OPEN' ? 'success' : 'warning'))}`}>
          <div className="mb-4 bg-white p-4 rounded-full shadow-sm text-current">
            {renderIcon('lock')}
          </div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border border-current bg-white/50">
            {(mode === 'COMMUNITY_OPEN' ? 'Accepting Orders' : 'Registration Closed')}
          </span>
          <h2 className="text-3xl font-serif font-bold mb-2">{headline}</h2>
          <p className="text-lg font-medium mb-2 opacity-90">{description}</p>
          
        </div>

        <div className="p-8 md:p-10 space-y-8 bg-gray-50/50">
          
          {/* Available Actions */}
          <div>
            <h3 className="text-lg font-bold text-heritage-ink mb-4 uppercase tracking-tight font-serif">Available Options</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableActions.map((action, idx) => (
                <div key={idx} className="bg-white p-6 rounded-2xl border border-gray-150 hover:border-heritage-gold/50 hover:shadow-md transition-all flex flex-col h-full group">
                  <div className="flex-grow">
                    <h4 className="text-xl font-bold text-heritage-ink mb-2 group-hover:text-heritage-green transition-colors">{action.title}</h4>
                    <p className="text-sm text-gray-600 mb-6">{action.description}</p>
                  </div>
                  <button
                    onClick={() => onSelectAction(action.type)}
                    className="w-full bg-heritage-ink text-white hover:bg-heritage-green py-3 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 group-hover:bg-heritage-gold group-hover:text-heritage-forest"
                  >
                    {action.buttonText}
                    <ArrowRight size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Next Available Batches */}
          {nextCommunityBatches && nextCommunityBatches.length > 0 && (
            <div className="pt-6 border-t border-gray-200">
              <h3 className="text-lg font-bold text-heritage-ink mb-4 uppercase tracking-tight font-serif">Upcoming Community Batches</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {nextCommunityBatches.map(batch => (
                  <div key={batch.id} className="bg-white p-5 rounded-2xl border border-gray-150 flex flex-col">
                    <div className="flex justify-between items-start mb-3">
                      <span className="bg-heritage-ink/5 text-heritage-ink text-[10px] uppercase font-bold px-2 py-1 rounded">
                        {batch.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">#{batch.batchNumber || batch.id.substring(0,6)}</span>
                    </div>
                    <h4 className="font-bold text-heritage-green mb-1 line-clamp-1" title={batch.name}>{batch.name}</h4>
                    <div className="text-xs text-gray-500 mb-4 space-y-1">
                      <div className="flex justify-between">
                        <span>Opens:</span>
                        <span className="font-medium text-heritage-ink">{new Date(batch.startDate).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Delivery:</span>
                        <span className="font-medium text-heritage-ink">{batch.expectedDelivery || "TBD"}</span>
                      </div>
                    </div>
                    {/* Just informational, they can't join a future batch yet if it's not open */}
                    <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-center">
                       <span className="text-xs font-medium text-gray-400">Opens Soon</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center pt-2">
            <button 
              onClick={onCancel}
              className="text-gray-500 hover:text-heritage-ink text-sm font-medium transition"
            >
              Return to Design Studio
            </button>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
