import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

target_remove = """    // Evaluate order routing on load for the banner
    const initialDecision = OrderRoutingEngine.evaluateOrder(orderContext, storeBatches || []);
    setRoutingDecision(initialDecision);"""
if target_remove in content:
    content = content.replace(target_remove, "")
else:
    print("Could not find initialDecision block")

target_insert = """  const [customGroupCode, setCustomGroupCode] = useState<string>("");"""

insertion = """  const [customGroupCode, setCustomGroupCode] = useState<string>("");

  useEffect(() => {
    const dynamicCtx = { ...ctx };
    if (batchType === "alone") dynamicCtx.orderType = "Individual";
    else if (batchType === "personalized") dynamicCtx.orderType = "Group Organizer";
    else dynamicCtx.orderType = "Community";
    
    const decision = OrderRoutingEngine.evaluateOrder(dynamicCtx, storeBatches || []);
    setRoutingDecision(decision);
  }, [batchType, storeBatches]);"""

if target_insert in content:
    content = content.replace(target_insert, insertion)
else:
    print("Could not find target_insert block")

with open("src/components/DesignStudioView.tsx", "w") as f:
    f.write(content)
