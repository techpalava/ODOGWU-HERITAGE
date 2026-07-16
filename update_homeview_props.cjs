const fs = require('fs');
let code = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

const match = `
interface HomeViewProps {
  onNavigateToTab: (tabId: string) => void;
  activeCommunityBatch?: OrderContext | null;
  communityPhotos?: CommunityPhoto[];
  showpieces?: Showpiece[];
  fabrics?: Fabric[];
  onSelectStyle?: (styleId: string, fabricCode: string) => void;
  onSelectFabric?: (fabricCode: string) => void;
}

export default function HomeView({
  onNavigateToTab,
  activeCommunityBatch,
  communityPhotos,
  showpieces = [],
  fabrics = [],
  onSelectStyle,
  onSelectFabric,
}: HomeViewProps) {
`;

const replacement = `
interface HomeViewProps {
  onNavigateToTab: (tabId: string) => void;
  activeCommunityBatch?: OrderContext | null;
  latestProductionBatch?: { batchId: string, batchName: string, batchStatus: string } | null;
  communityPhotos?: CommunityPhoto[];
  showpieces?: Showpiece[];
  fabrics?: Fabric[];
  onSelectStyle?: (styleId: string, fabricCode: string) => void;
  onSelectFabric?: (fabricCode: string) => void;
}

export default function HomeView({
  onNavigateToTab,
  activeCommunityBatch,
  latestProductionBatch,
  communityPhotos,
  showpieces = [],
  fabrics = [],
  onSelectStyle,
  onSelectFabric,
}: HomeViewProps) {
`;
code = code.replace(match, replacement);

const match2 = `                const presentation = BatchBusinessRules.getPresentation(activeCommunityBatch);`;
const replacement2 = `                const presentation = BatchBusinessRules.getPresentation(activeCommunityBatch || latestProductionBatch);`;
code = code.replace(match2, replacement2);

const match3 = `                const progress = BatchBusinessRules.getProgressState(activeCommunityBatch);`;
const replacement3 = `                const progress = BatchBusinessRules.getProgressState(activeCommunityBatch || latestProductionBatch);`;
code = code.replace(match3, replacement3);

const match4 = `                        <h3 className="text-lg font-serif font-bold text-white mt-0.5">
                          {presentation.headline}
                        </h3>`;
const replacement4 = `                        <h3 className="text-lg font-serif font-bold text-white mt-0.5" title={presentation.headline}>
                          {presentation.headline}
                        </h3>`;
// actually I'll just change getPresentation slightly? No, I'll let getPresentation be handled by HomeView.

// The hero action buttons need to be updated as well.
const actionMatch = `
  const canJoinActiveBatch = activeCommunityBatch ? BatchBusinessRules.canAcceptOrders(activeCommunityBatch as any).canAcceptOrders : false;
  const heroPrimaryAction = canJoinActiveBatch ? \`Join \${(activeCommunityBatch as any)?.name || (activeCommunityBatch as any)?.batchName || ''}\`.trim() : "Create Custom Order";
  const firstHeroPrimaryAction = canJoinActiveBatch ? \`Join \${(activeCommunityBatch as any)?.name || (activeCommunityBatch as any)?.batchName || ''}\`.trim() : "Create Group";
  const heroDestination = canJoinActiveBatch ? "design" : "custom-order";
`;
const actionReplace = `
  const canJoinActiveBatch = activeCommunityBatch ? BatchBusinessRules.canAcceptOrders(activeCommunityBatch as any).canAcceptOrders : false;
  const heroPrimaryAction = canJoinActiveBatch ? \`Join \${(activeCommunityBatch as any)?.name || (activeCommunityBatch as any)?.batchName || ''}\`.trim() : "Create Custom Order";
  const firstHeroPrimaryAction = canJoinActiveBatch ? \`Join \${(activeCommunityBatch as any)?.name || (activeCommunityBatch as any)?.batchName || ''}\`.trim() : "Create Group";
  const heroDestination = canJoinActiveBatch ? "design" : "custom-order";
`;

code = code.replace(actionMatch, actionReplace);

fs.writeFileSync('src/components/HomeView.tsx', code);
