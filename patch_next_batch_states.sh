#!/bin/bash
sed -i '/const \[showAddedModal, setShowAddedModal\] = useState<boolean>(false);/a \
  const [showNextBatchConfirm, setShowNextBatchConfirm] = useState<boolean>(false);\n  const [nextBatchToJoin, setNextBatchToJoin] = useState<any>(null);\n  const [draftCommunityBatchName, setDraftCommunityBatchName] = useState<string>("");' src/components/DesignStudioView.tsx
