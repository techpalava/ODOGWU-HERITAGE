import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

old_str = """                  {(() => {
                    const isClosed = (() => {
                      if (!activeCommunityBatch?.closingDate) return false;
                      try {
                        return (
                          new Date(activeCommunityBatch.closingDate) <
                          new Date()
                        );
                      } catch (e) {
                        return false;
                      }
                    })();
                    if (isClosed) {"""

new_str = """                  {(() => {
                    const isFull = (activeCommunityBatch?.currentMembers ?? 0) >= (activeCommunityBatch?.expectedParticipants ?? 0);
                    const isTimeUp = (() => {
                      if (!activeCommunityBatch?.closingDate) return false;
                      try {
                        return (
                          new Date(activeCommunityBatch.closingDate) <
                          new Date()
                        );
                      } catch (e) {
                        return false;
                      }
                    })();
                    const isClosed = isFull || isTimeUp;
                    if (isClosed) {"""

content = content.replace(old_str, new_str)

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(content)
