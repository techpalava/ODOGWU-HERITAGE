const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

// Replace proceedToCart finalBatchName logic
content = content.replace(
`    const finalBatchName =
      batchType === "community"
        ? ctx.batchName
        : batchType === "alone"`,
`    const finalBatchName =
      batchType === "community"
        ? (draftCommunityBatchName || ctx.batchName)
        : batchType === "alone"`);

// Replace handleRoutingActionSelect NEXT_BATCH logic
content = content.replace(
`    if (actionType === "INDIVIDUAL_ORDER") {
      setBatchType("alone");
    } else if (actionType === "PERSONALIZED_BATCH") {
      setBatchType("personalized");
    } else if (actionType === "COMMUNITY_ORDER" || actionType === "NEXT_BATCH") {
      setBatchType("community");
    }
    setShowRoutingPanel(false);`,
`    if (actionType === "INDIVIDUAL_ORDER") {
      setBatchType("alone");
      setShowRoutingPanel(false);
    } else if (actionType === "PERSONALIZED_BATCH") {
      setBatchType("personalized");
      setShowRoutingPanel(false);
    } else if (actionType === "COMMUNITY_ORDER") {
      setBatchType("community");
      setDraftCommunityBatchName("");
      setShowRoutingPanel(false);
    } else if (actionType === "NEXT_BATCH") {
      const nextBatch = routingPresentation?.nextCommunityBatches?.[0];
      if (nextBatch) {
        setNextBatchToJoin(nextBatch);
        setShowNextBatchConfirm(true);
      }
    }`);

// Add handleConfirmNextBatch method
content = content.replace(
`  const resetDesignStudio = () => {`,
`  const handleConfirmNextBatch = () => {
    if (nextBatchToJoin) {
      setBatchType("community");
      setDraftCommunityBatchName(nextBatchToJoin.name);
    }
    setShowNextBatchConfirm(false);
    setShowRoutingPanel(false);
  };

  const resetDesignStudio = () => {`);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
