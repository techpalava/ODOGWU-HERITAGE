import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

old = r'''                showpieces={showpieces}
                onSelectStyle={(styleId, fabricCode) => {'''

new = r'''                showpieces={showpieces}
                fabrics={fabrics}
                onSelectStyle={(styleId, fabricCode) => {'''

content = content.replace(old, new)

old_select_fabric = r'''                    triggerNotification(
                      "Design Studio loaded with your selected look.",
                      "info"
                    );
                  }
                }}
              />'''

new_select_fabric = r'''                    triggerNotification(
                      "Design Studio loaded with your selected look.",
                      "info"
                    );
                  }
                }}
                onSelectFabric={(fabricCode) => {
                  setPresetStyleId(undefined);
                  setPresetFabricCode(fabricCode);
                  if (!currentUser) {
                    setActiveTab("login");
                    triggerNotification(
                      "Please login to customize this fabric.",
                      "info"
                    );
                  } else {
                    setOrderContext(activeCommunityBatch);
                    setActiveTab("design");
                    triggerNotification(
                      "Design Studio loaded with your selected fabric.",
                      "info"
                    );
                  }
                }}
              />'''

content = content.replace(old_select_fabric, new_select_fabric)

with open('src/App.tsx', 'w') as f:
    f.write(content)
