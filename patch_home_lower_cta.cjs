const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

const marker = `          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-4">
            <button
              onClick={onStartDesigning}
              className="w-full sm:w-auto bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 px-10 py-4 rounded-xl text-sm font-bold uppercase tracking-wider shadow-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              Join Current Batch <ArrowRight size={16} />
            </button>
            <button`;

const replacement = `          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-4">
            {activeCommunityBatch && canJoinActiveBatch ? (
              <button
                onClick={onStartDesigning}
                className="w-full sm:w-auto bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 px-10 py-4 rounded-xl text-sm font-bold uppercase tracking-wider shadow-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                Join Current Batch <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={() => onNavigateToTab("custom-order")}
                className="w-full sm:w-auto bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 px-10 py-4 rounded-xl text-sm font-bold uppercase tracking-wider shadow-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                Create Custom Order <ArrowRight size={16} />
              </button>
            )}
            <button`;

content = content.replace(marker, replacement);
fs.writeFileSync('src/components/HomeView.tsx', content);
