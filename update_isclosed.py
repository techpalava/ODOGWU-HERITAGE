import re
import os

files = ['src/components/HomeView.tsx', 'src/components/DesignStudioView.tsx']

for file in files:
    with open(file, 'r') as f:
        content = f.read()
    
    # In HomeView:
    if file == 'src/components/HomeView.tsx':
        content = content.replace("const isClosed = isFull || isTimeUp;", "const isClosed = isFull || isTimeUp || activeCommunityBatch?.allowOrders === false || activeCommunityBatch?.batchStatus === 'CLOSED';")
    # In DesignStudioView:
    elif file == 'src/components/DesignStudioView.tsx':
        content = content.replace("const isClosed = isFull || isTimeUp;", "const isClosed = isFull || isTimeUp || orderContext?.allowOrders === false || orderContext?.batchStatus === 'CLOSED';")
        
    with open(file, 'w') as f:
        f.write(content)
