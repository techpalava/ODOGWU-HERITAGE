import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

if 'import { CustomGroup, OrderContext, Batch, CommunityPhoto, Showpiece, Fabric }' not in content:
    content = content.replace('import { CustomGroup, OrderContext, Batch, CommunityPhoto, Showpiece }', 'import { CustomGroup, OrderContext, Batch, CommunityPhoto, Showpiece, Fabric }')
    
old_props = """interface HomeViewProps {
  onStartDesigning: () => void;
  onNavigateToTab: (tabId: string) => void;
  activeCommunityBatch?: OrderContext | null;
  communityPhotos?: CommunityPhoto[];
  showpieces?: Showpiece[];
  onSelectStyle?: (styleId: string, fabricCode: string) => void;
}

export default function HomeView({
  onStartDesigning,
  onNavigateToTab,
  activeCommunityBatch,
  communityPhotos,
  showpieces = [],
  onSelectStyle,
}: HomeViewProps) {"""

new_props = """interface HomeViewProps {
  onStartDesigning: () => void;
  onNavigateToTab: (tabId: string) => void;
  activeCommunityBatch?: OrderContext | null;
  communityPhotos?: CommunityPhoto[];
  showpieces?: Showpiece[];
  fabrics?: Fabric[];
  onSelectStyle?: (styleId: string, fabricCode: string) => void;
  onSelectFabric?: (fabricCode: string) => void;
}

export default function HomeView({
  onStartDesigning,
  onNavigateToTab,
  activeCommunityBatch,
  communityPhotos,
  showpieces = [],
  fabrics = [],
  onSelectStyle,
  onSelectFabric,
}: HomeViewProps) {"""

content = content.replace(old_props, new_props)

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(content)
