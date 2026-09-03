/** I174 generated Renderer client registry; update only through update:desktop-ipc-lock. */
export const DESKTOP_CLIENT_SERVICES = [
  {
    "key": "workspace",
    "namespace": "novelWorkspace",
    "methods": [
      {
        "method": "viewModel",
        "methodId": "novel-creation-tool/novelWorkspace/viewModel"
      },
      {
        "method": "characterList",
        "methodId": "novel-creation-tool/novelWorkspace/characterList"
      },
      {
        "method": "characterRead",
        "methodId": "novel-creation-tool/novelWorkspace/characterRead"
      },
      {
        "method": "characterCreate",
        "methodId": "novel-creation-tool/novelWorkspace/characterCreate"
      },
      {
        "method": "characterUpdate",
        "methodId": "novel-creation-tool/novelWorkspace/characterUpdate"
      },
      {
        "method": "worldviewList",
        "methodId": "novel-creation-tool/novelWorkspace/worldviewList"
      },
      {
        "method": "worldviewRead",
        "methodId": "novel-creation-tool/novelWorkspace/worldviewRead"
      },
      {
        "method": "worldviewCreate",
        "methodId": "novel-creation-tool/novelWorkspace/worldviewCreate"
      },
      {
        "method": "worldviewRewrite",
        "methodId": "novel-creation-tool/novelWorkspace/worldviewRewrite"
      },
      {
        "method": "outlineRead",
        "methodId": "novel-creation-tool/novelWorkspace/outlineRead"
      },
      {
        "method": "outlineSave",
        "methodId": "novel-creation-tool/novelWorkspace/outlineSave"
      },
      {
        "method": "outlineBeatCards",
        "methodId": "novel-creation-tool/novelWorkspace/outlineBeatCards"
      },
      {
        "method": "relationshipRead",
        "methodId": "novel-creation-tool/novelWorkspace/relationshipRead"
      },
      {
        "method": "relationshipSave",
        "methodId": "novel-creation-tool/novelWorkspace/relationshipSave"
      },
      {
        "method": "stateCurrent",
        "methodId": "novel-creation-tool/novelWorkspace/stateCurrent"
      },
      {
        "method": "stateSnapshots",
        "methodId": "novel-creation-tool/novelWorkspace/stateSnapshots"
      },
      {
        "method": "stateRollback",
        "methodId": "novel-creation-tool/novelWorkspace/stateRollback"
      },
      {
        "method": "stateDiff",
        "methodId": "novel-creation-tool/novelWorkspace/stateDiff"
      },
      {
        "method": "canonQuery",
        "methodId": "novel-creation-tool/novelWorkspace/canonQuery"
      },
      {
        "method": "canonCorrectionPropose",
        "methodId": "novel-creation-tool/novelWorkspace/canonCorrectionPropose"
      },
      {
        "method": "canonCorrectionAccept",
        "methodId": "novel-creation-tool/novelWorkspace/canonCorrectionAccept"
      },
      {
        "method": "chapterList",
        "methodId": "novel-creation-tool/novelWorkspace/chapterList"
      },
      {
        "method": "chapterRead",
        "methodId": "novel-creation-tool/novelWorkspace/chapterRead"
      },
      {
        "method": "sceneRead",
        "methodId": "novel-creation-tool/novelWorkspace/sceneRead"
      },
      {
        "method": "sceneEdit",
        "methodId": "novel-creation-tool/novelWorkspace/sceneEdit"
      },
      {
        "method": "sceneReparsePropose",
        "methodId": "novel-creation-tool/novelWorkspace/sceneReparsePropose"
      },
      {
        "method": "sceneReparseAccept",
        "methodId": "novel-creation-tool/novelWorkspace/sceneReparseAccept"
      },
      {
        "method": "sceneReparseReject",
        "methodId": "novel-creation-tool/novelWorkspace/sceneReparseReject"
      },
      {
        "method": "sceneReparsePreview",
        "methodId": "novel-creation-tool/novelWorkspace/sceneReparsePreview"
      },
      {
        "method": "projectList",
        "methodId": "novel-creation-tool/novelWorkspace/projectList"
      },
      {
        "method": "projectCreate",
        "methodId": "novel-creation-tool/novelWorkspace/projectCreate"
      },
      {
        "method": "projectOpen",
        "methodId": "novel-creation-tool/novelWorkspace/projectOpen"
      },
      {
        "method": "projectArchiveList",
        "methodId": "novel-creation-tool/novelWorkspace/projectArchiveList"
      },
      {
        "method": "projectArchive",
        "methodId": "novel-creation-tool/novelWorkspace/projectArchive"
      },
      {
        "method": "projectRestore",
        "methodId": "novel-creation-tool/novelWorkspace/projectRestore"
      },
      {
        "method": "uploadStart",
        "methodId": "novel-creation-tool/novelWorkspace/uploadStart"
      },
      {
        "method": "uploadChunk",
        "methodId": "novel-creation-tool/novelWorkspace/uploadChunk"
      },
      {
        "method": "uploadFinalize",
        "methodId": "novel-creation-tool/novelWorkspace/uploadFinalize"
      },
      {
        "method": "uploadCancel",
        "methodId": "novel-creation-tool/novelWorkspace/uploadCancel"
      }
    ]
  },
  {
    "key": "analyzer",
    "namespace": "novelOnboardingAnalyzer",
    "methods": [
      {
        "method": "begin",
        "methodId": "novel-creation-tool/novelOnboardingAnalyzer/begin"
      },
      {
        "method": "start",
        "methodId": "novel-creation-tool/novelOnboardingAnalyzer/start"
      },
      {
        "method": "status",
        "methodId": "novel-creation-tool/novelOnboardingAnalyzer/status"
      },
      {
        "method": "cancel",
        "methodId": "novel-creation-tool/novelOnboardingAnalyzer/cancel"
      },
      {
        "method": "result",
        "methodId": "novel-creation-tool/novelOnboardingAnalyzer/result"
      }
    ]
  },
  {
    "key": "onboarding",
    "namespace": "novelOnboarding",
    "methods": [
      {
        "method": "adjudicate",
        "methodId": "novel-creation-tool/novelOnboarding/adjudicate"
      },
      {
        "method": "acceptedLayers",
        "methodId": "novel-creation-tool/novelOnboarding/acceptedLayers"
      },
      {
        "method": "finalApply",
        "methodId": "novel-creation-tool/novelOnboarding/finalApply"
      }
    ]
  },
  {
    "key": "llmConfig",
    "namespace": "novelLlmConfig",
    "methods": [
      {
        "method": "load",
        "methodId": "novel-creation-tool/novelLlmConfig/load"
      },
      {
        "method": "save",
        "methodId": "novel-creation-tool/novelLlmConfig/save"
      }
    ]
  },
  {
    "key": "workbenchSettings",
    "namespace": "novelWorkbenchSettings",
    "methods": [
      {
        "method": "load",
        "methodId": "novel-creation-tool/novelWorkbenchSettings/load"
      },
      {
        "method": "save",
        "methodId": "novel-creation-tool/novelWorkbenchSettings/save"
      },
      {
        "method": "openProjectFolder",
        "methodId": "novel-creation-tool/novelWorkbenchSettings/openProjectFolder"
      }
    ]
  },
  {
    "key": "writing",
    "namespace": "novelWriting",
    "methods": [
      {
        "method": "propose",
        "methodId": "novel-creation-tool/novelWriting/propose"
      },
      {
        "method": "preview",
        "methodId": "novel-creation-tool/novelWriting/preview"
      },
      {
        "method": "adjudicate",
        "methodId": "novel-creation-tool/novelWriting/adjudicate"
      },
      {
        "method": "proposeAt",
        "methodId": "novel-creation-tool/novelWriting/proposeAt"
      },
      {
        "method": "adoptDraft",
        "methodId": "novel-creation-tool/novelWriting/adoptDraft"
      },
      {
        "method": "prepareFinalizationPlan",
        "methodId": "novel-creation-tool/novelWriting/prepareFinalizationPlan"
      },
      {
        "method": "readFinalizationPlan",
        "methodId": "novel-creation-tool/novelWriting/readFinalizationPlan"
      },
      {
        "method": "cancelFinalizationPlan",
        "methodId": "novel-creation-tool/novelWriting/cancelFinalizationPlan"
      },
      {
        "method": "proposeFinalization",
        "methodId": "novel-creation-tool/novelWriting/proposeFinalization"
      },
      {
        "method": "acceptFinalization",
        "methodId": "novel-creation-tool/novelWriting/acceptFinalization"
      },
      {
        "method": "rejectFinalization",
        "methodId": "novel-creation-tool/novelWriting/rejectFinalization"
      },
      {
        "method": "previewLayers",
        "methodId": "novel-creation-tool/novelWriting/previewLayers"
      }
    ]
  },
  {
    "key": "reviewNamespace",
    "namespace": "novelReview",
    "methods": [
      {
        "method": "scan",
        "methodId": "novel-creation-tool/novelReview/scan"
      },
      {
        "method": "adjudicate",
        "methodId": "novel-creation-tool/novelReview/adjudicate"
      },
      {
        "method": "records",
        "methodId": "novel-creation-tool/novelReview/records"
      },
      {
        "method": "bookReadiness",
        "methodId": "novel-creation-tool/novelReview/bookReadiness"
      },
      {
        "method": "bookScan",
        "methodId": "novel-creation-tool/novelReview/bookScan"
      }
    ]
  },
  {
    "key": "reviewRepairNamespace",
    "namespace": "novelReviewRepair",
    "methods": [
      {
        "method": "propose",
        "methodId": "novel-creation-tool/novelReviewRepair/propose"
      }
    ]
  },
  {
    "key": "queueNamespace",
    "namespace": "novelQueue",
    "methods": [
      {
        "method": "status",
        "methodId": "novel-creation-tool/novelQueue/status"
      },
      {
        "method": "start",
        "methodId": "novel-creation-tool/novelQueue/start"
      },
      {
        "method": "startAt",
        "methodId": "novel-creation-tool/novelQueue/startAt"
      },
      {
        "method": "pause",
        "methodId": "novel-creation-tool/novelQueue/pause"
      },
      {
        "method": "resume",
        "methodId": "novel-creation-tool/novelQueue/resume"
      },
      {
        "method": "cancel",
        "methodId": "novel-creation-tool/novelQueue/cancel"
      },
      {
        "method": "retry",
        "methodId": "novel-creation-tool/novelQueue/retry"
      },
      {
        "method": "cancelTask",
        "methodId": "novel-creation-tool/novelQueue/cancelTask"
      },
      {
        "method": "recover",
        "methodId": "novel-creation-tool/novelQueue/recover"
      }
    ]
  },
  {
    "key": "knowledgeNamespace",
    "namespace": "novelKnowledgeManager",
    "methods": [
      {
        "method": "list",
        "methodId": "novel-creation-tool/novelKnowledgeManager/list"
      },
      {
        "method": "read",
        "methodId": "novel-creation-tool/novelKnowledgeManager/read"
      },
      {
        "method": "propose",
        "methodId": "novel-creation-tool/novelKnowledgeManager/propose"
      },
      {
        "method": "accept",
        "methodId": "novel-creation-tool/novelKnowledgeManager/accept"
      },
      {
        "method": "reject",
        "methodId": "novel-creation-tool/novelKnowledgeManager/reject"
      },
      {
        "method": "pending",
        "methodId": "novel-creation-tool/novelKnowledgeManager/pending"
      }
    ]
  },
  {
    "key": "ruleStyleNamespace",
    "namespace": "novelRuleStyleManager",
    "methods": [
      {
        "method": "list",
        "methodId": "novel-creation-tool/novelRuleStyleManager/list"
      },
      {
        "method": "readRule",
        "methodId": "novel-creation-tool/novelRuleStyleManager/readRule"
      },
      {
        "method": "createRule",
        "methodId": "novel-creation-tool/novelRuleStyleManager/createRule"
      },
      {
        "method": "updateRule",
        "methodId": "novel-creation-tool/novelRuleStyleManager/updateRule"
      },
      {
        "method": "readStyle",
        "methodId": "novel-creation-tool/novelRuleStyleManager/readStyle"
      },
      {
        "method": "saveStyle",
        "methodId": "novel-creation-tool/novelRuleStyleManager/saveStyle"
      }
    ]
  },
  {
    "key": "progressNamespace",
    "namespace": "novelOutlineProgress",
    "methods": [
      {
        "method": "projection",
        "methodId": "novel-creation-tool/novelOutlineProgress/projection"
      },
      {
        "method": "recordDeviation",
        "methodId": "novel-creation-tool/novelOutlineProgress/recordDeviation"
      },
      {
        "method": "reconcileDeviation",
        "methodId": "novel-creation-tool/novelOutlineProgress/reconcileDeviation"
      },
      {
        "method": "inspire",
        "methodId": "novel-creation-tool/novelOutlineProgress/inspire"
      },
      {
        "method": "select",
        "methodId": "novel-creation-tool/novelOutlineProgress/select"
      },
      {
        "method": "apply",
        "methodId": "novel-creation-tool/novelOutlineProgress/apply"
      },
      {
        "method": "reject",
        "methodId": "novel-creation-tool/novelOutlineProgress/reject"
      },
      {
        "method": "pending",
        "methodId": "novel-creation-tool/novelOutlineProgress/pending"
      },
      {
        "method": "audit",
        "methodId": "novel-creation-tool/novelOutlineProgress/audit"
      }
    ]
  },
  {
    "key": "importExportNamespace",
    "namespace": "novelImportExport",
    "methods": [
      {
        "method": "exportArchive",
        "methodId": "novel-creation-tool/novelImportExport/exportArchive"
      },
      {
        "method": "exportText",
        "methodId": "novel-creation-tool/novelImportExport/exportText"
      },
      {
        "method": "restore",
        "methodId": "novel-creation-tool/novelImportExport/restore"
      },
      {
        "method": "importPreview",
        "methodId": "novel-creation-tool/novelImportExport/importPreview"
      },
      {
        "method": "normalizeSource",
        "methodId": "novel-creation-tool/novelImportExport/normalizeSource"
      },
      {
        "method": "compileManuscript",
        "methodId": "novel-creation-tool/novelImportExport/compileManuscript"
      }
    ]
  },
  {
    "key": "branchNamespace",
    "namespace": "novelBranches",
    "methods": [
      {
        "method": "list",
        "methodId": "novel-creation-tool/novelBranches/list"
      },
      {
        "method": "read",
        "methodId": "novel-creation-tool/novelBranches/read"
      },
      {
        "method": "save",
        "methodId": "novel-creation-tool/novelBranches/save"
      },
      {
        "method": "choose",
        "methodId": "novel-creation-tool/novelBranches/choose"
      },
      {
        "method": "diff",
        "methodId": "novel-creation-tool/novelBranches/diff"
      },
      {
        "method": "aggregate",
        "methodId": "novel-creation-tool/novelBranches/aggregate"
      },
      {
        "method": "chooseFresh",
        "methodId": "novel-creation-tool/novelBranches/chooseFresh"
      }
    ]
  },
  {
    "key": "searchNamespace",
    "namespace": "novelSearch",
    "methods": [
      {
        "method": "build",
        "methodId": "novel-creation-tool/novelSearch/build"
      },
      {
        "method": "drop",
        "methodId": "novel-creation-tool/novelSearch/drop"
      },
      {
        "method": "stats",
        "methodId": "novel-creation-tool/novelSearch/stats"
      },
      {
        "method": "search",
        "methodId": "novel-creation-tool/novelSearch/search"
      },
      {
        "method": "references",
        "methodId": "novel-creation-tool/novelSearch/references"
      }
    ]
  },
  {
    "key": "statisticsNamespace",
    "namespace": "novelStatistics",
    "methods": [
      {
        "method": "rebuild",
        "methodId": "novel-creation-tool/novelStatistics/rebuild"
      },
      {
        "method": "drop",
        "methodId": "novel-creation-tool/novelStatistics/drop"
      },
      {
        "method": "stats",
        "methodId": "novel-creation-tool/novelStatistics/stats"
      },
      {
        "method": "overview",
        "methodId": "novel-creation-tool/novelStatistics/overview"
      },
      {
        "method": "chapterDetail",
        "methodId": "novel-creation-tool/novelStatistics/chapterDetail"
      },
      {
        "method": "sceneCards",
        "methodId": "novel-creation-tool/novelStatistics/sceneCards"
      },
      {
        "method": "tasks",
        "methodId": "novel-creation-tool/novelStatistics/tasks"
      }
    ]
  },
  {
    "key": "timelineNamespace",
    "namespace": "novelTimeline",
    "methods": [
      {
        "method": "read",
        "methodId": "novel-creation-tool/novelTimeline/read"
      },
      {
        "method": "ensureFromOutline",
        "methodId": "novel-creation-tool/novelTimeline/ensureFromOutline"
      },
      {
        "method": "setCurrentNode",
        "methodId": "novel-creation-tool/novelTimeline/setCurrentNode"
      },
      {
        "method": "save",
        "methodId": "novel-creation-tool/novelTimeline/save"
      }
    ]
  },
  {
    "key": "textMutation",
    "namespace": "novelText",
    "methods": [
      {
        "method": "fingerprint",
        "methodId": "novel-creation-tool/novelText/fingerprint"
      },
      {
        "method": "chapterCreate",
        "methodId": "novel-creation-tool/novelText/chapterCreate"
      },
      {
        "method": "chapterUpdate",
        "methodId": "novel-creation-tool/novelText/chapterUpdate"
      },
      {
        "method": "sceneCreate",
        "methodId": "novel-creation-tool/novelText/sceneCreate"
      },
      {
        "method": "sceneUpdate",
        "methodId": "novel-creation-tool/novelText/sceneUpdate"
      },
      {
        "method": "reorder",
        "methodId": "novel-creation-tool/novelText/reorder"
      }
    ]
  },
  {
    "key": "sceneOutlineBinding",
    "namespace": "novelSceneOutlineBinding",
    "methods": [
      {
        "method": "read",
        "methodId": "novel-creation-tool/novelSceneOutlineBinding/read"
      },
      {
        "method": "save",
        "methodId": "novel-creation-tool/novelSceneOutlineBinding/save"
      },
      {
        "method": "rebind",
        "methodId": "novel-creation-tool/novelSceneOutlineBinding/rebind"
      },
      {
        "method": "unbind",
        "methodId": "novel-creation-tool/novelSceneOutlineBinding/unbind"
      },
      {
        "method": "impact",
        "methodId": "novel-creation-tool/novelSceneOutlineBinding/impact"
      }
    ]
  },
  {
    "key": "textDeletion",
    "namespace": "novelTextDeletion",
    "methods": [
      {
        "method": "impact",
        "methodId": "novel-creation-tool/novelTextDeletion/impact"
      },
      {
        "method": "propose",
        "methodId": "novel-creation-tool/novelTextDeletion/propose"
      },
      {
        "method": "apply",
        "methodId": "novel-creation-tool/novelTextDeletion/apply"
      },
      {
        "method": "reject",
        "methodId": "novel-creation-tool/novelTextDeletion/reject"
      }
    ]
  },
  {
    "key": "outlineReconciliation",
    "namespace": "novelOutlineReconciliation",
    "methods": [
      {
        "method": "prepare",
        "methodId": "novel-creation-tool/novelOutlineReconciliation/prepare"
      },
      {
        "method": "regenerateOne",
        "methodId": "novel-creation-tool/novelOutlineReconciliation/regenerateOne"
      },
      {
        "method": "read",
        "methodId": "novel-creation-tool/novelOutlineReconciliation/read"
      },
      {
        "method": "cancel",
        "methodId": "novel-creation-tool/novelOutlineReconciliation/cancel"
      },
      {
        "method": "propose",
        "methodId": "novel-creation-tool/novelOutlineReconciliation/propose"
      },
      {
        "method": "accept",
        "methodId": "novel-creation-tool/novelOutlineReconciliation/accept"
      },
      {
        "method": "reject",
        "methodId": "novel-creation-tool/novelOutlineReconciliation/reject"
      },
      {
        "method": "finalize",
        "methodId": "novel-creation-tool/novelOutlineReconciliation/finalize"
      },
      {
        "method": "continue",
        "methodId": "novel-creation-tool/novelOutlineReconciliation/continue"
      }
    ]
  },
  {
    "key": "referenceAudit",
    "namespace": "novelReferenceAudit",
    "methods": [
      {
        "method": "list",
        "methodId": "novel-creation-tool/novelReferenceAudit/list"
      }
    ]
  },
  {
    "key": "referenceCorrection",
    "namespace": "novelReferenceCorrection",
    "methods": [
      {
        "method": "propose",
        "methodId": "novel-creation-tool/novelReferenceCorrection/propose"
      },
      {
        "method": "accept",
        "methodId": "novel-creation-tool/novelReferenceCorrection/accept"
      },
      {
        "method": "reject",
        "methodId": "novel-creation-tool/novelReferenceCorrection/reject"
      },
      {
        "method": "pending",
        "methodId": "novel-creation-tool/novelReferenceCorrection/pending"
      }
    ]
  },
  {
    "key": "longDraft",
    "namespace": "novelLongDraft",
    "methods": [
      {
        "method": "preflight",
        "methodId": "novel-creation-tool/novelLongDraft/preflight"
      },
      {
        "method": "begin",
        "methodId": "novel-creation-tool/novelLongDraft/begin"
      },
      {
        "method": "status",
        "methodId": "novel-creation-tool/novelLongDraft/status"
      },
      {
        "method": "cancel",
        "methodId": "novel-creation-tool/novelLongDraft/cancel"
      },
      {
        "method": "result",
        "methodId": "novel-creation-tool/novelLongDraft/result"
      },
      {
        "method": "proposeApply",
        "methodId": "novel-creation-tool/novelLongDraft/proposeApply"
      },
      {
        "method": "accept",
        "methodId": "novel-creation-tool/novelLongDraft/accept"
      },
      {
        "method": "reject",
        "methodId": "novel-creation-tool/novelLongDraft/reject"
      },
      {
        "method": "recover",
        "methodId": "novel-creation-tool/novelLongDraft/recover"
      }
    ]
  },
  {
    "key": "outlineDetailGeneration",
    "namespace": "novelOutlineDetailGeneration",
    "methods": [
      {
        "method": "generate",
        "methodId": "novel-creation-tool/novelOutlineDetailGeneration/generate"
      },
      {
        "method": "read",
        "methodId": "novel-creation-tool/novelOutlineDetailGeneration/read"
      },
      {
        "method": "edit",
        "methodId": "novel-creation-tool/novelOutlineDetailGeneration/edit"
      },
      {
        "method": "regenerate",
        "methodId": "novel-creation-tool/novelOutlineDetailGeneration/regenerate"
      },
      {
        "method": "skip",
        "methodId": "novel-creation-tool/novelOutlineDetailGeneration/skip"
      },
      {
        "method": "propose",
        "methodId": "novel-creation-tool/novelOutlineDetailGeneration/propose"
      },
      {
        "method": "accept",
        "methodId": "novel-creation-tool/novelOutlineDetailGeneration/accept"
      },
      {
        "method": "reject",
        "methodId": "novel-creation-tool/novelOutlineDetailGeneration/reject"
      },
      {
        "method": "cancel",
        "methodId": "novel-creation-tool/novelOutlineDetailGeneration/cancel"
      },
      {
        "method": "append",
        "methodId": "novel-creation-tool/novelOutlineDetailGeneration/append"
      },
      {
        "method": "select",
        "methodId": "novel-creation-tool/novelOutlineDetailGeneration/select"
      }
    ]
  },
  {
    "key": "importInterpretation",
    "namespace": "novelImportInterpretation",
    "methods": [
      {
        "method": "create",
        "methodId": "novel-creation-tool/novelImportInterpretation/create"
      },
      {
        "method": "read",
        "methodId": "novel-creation-tool/novelImportInterpretation/read"
      },
      {
        "method": "confirm",
        "methodId": "novel-creation-tool/novelImportInterpretation/confirm"
      },
      {
        "method": "discard",
        "methodId": "novel-creation-tool/novelImportInterpretation/discard"
      }
    ]
  },
  {
    "key": "importInterpretationAnalysis",
    "namespace": "novelImportInterpretationAnalysis",
    "methods": [
      {
        "method": "begin",
        "methodId": "novel-creation-tool/novelImportInterpretationAnalysis/begin"
      },
      {
        "method": "status",
        "methodId": "novel-creation-tool/novelImportInterpretationAnalysis/status"
      },
      {
        "method": "cancel",
        "methodId": "novel-creation-tool/novelImportInterpretationAnalysis/cancel"
      },
      {
        "method": "result",
        "methodId": "novel-creation-tool/novelImportInterpretationAnalysis/result"
      }
    ]
  },
  {
    "key": "ruleStyleImportInitialization",
    "namespace": "novelRuleStyleImportInitialization",
    "methods": [
      {
        "method": "begin",
        "methodId": "novel-creation-tool/novelRuleStyleImportInitialization/begin"
      },
      {
        "method": "status",
        "methodId": "novel-creation-tool/novelRuleStyleImportInitialization/status"
      },
      {
        "method": "result",
        "methodId": "novel-creation-tool/novelRuleStyleImportInitialization/result"
      },
      {
        "method": "propose",
        "methodId": "novel-creation-tool/novelRuleStyleImportInitialization/propose"
      },
      {
        "method": "accept",
        "methodId": "novel-creation-tool/novelRuleStyleImportInitialization/accept"
      },
      {
        "method": "reject",
        "methodId": "novel-creation-tool/novelRuleStyleImportInitialization/reject"
      },
      {
        "method": "cancel",
        "methodId": "novel-creation-tool/novelRuleStyleImportInitialization/cancel"
      }
    ]
  },
  {
    "key": "narrativeAdaptation",
    "namespace": "novelNarrativeAdaptation",
    "methods": [
      {
        "method": "begin",
        "methodId": "novel-creation-tool/novelNarrativeAdaptation/begin"
      },
      {
        "method": "status",
        "methodId": "novel-creation-tool/novelNarrativeAdaptation/status"
      },
      {
        "method": "cancel",
        "methodId": "novel-creation-tool/novelNarrativeAdaptation/cancel"
      },
      {
        "method": "result",
        "methodId": "novel-creation-tool/novelNarrativeAdaptation/result"
      }
    ]
  },
  {
    "key": "narrativeReveal",
    "namespace": "novelNarrativeReveal",
    "methods": [
      {
        "method": "begin",
        "methodId": "novel-creation-tool/novelNarrativeReveal/begin"
      },
      {
        "method": "status",
        "methodId": "novel-creation-tool/novelNarrativeReveal/status"
      },
      {
        "method": "cancel",
        "methodId": "novel-creation-tool/novelNarrativeReveal/cancel"
      },
      {
        "method": "result",
        "methodId": "novel-creation-tool/novelNarrativeReveal/result"
      }
    ]
  },
  {
    "key": "narrativeImportPlan",
    "namespace": "novelNarrativeImportPlan",
    "methods": [
      {
        "method": "propose",
        "methodId": "novel-creation-tool/novelNarrativeImportPlan/propose"
      },
      {
        "method": "read",
        "methodId": "novel-creation-tool/novelNarrativeImportPlan/read"
      },
      {
        "method": "accept",
        "methodId": "novel-creation-tool/novelNarrativeImportPlan/accept"
      },
      {
        "method": "reject",
        "methodId": "novel-creation-tool/novelNarrativeImportPlan/reject"
      },
      {
        "method": "recover",
        "methodId": "novel-creation-tool/novelNarrativeImportPlan/recover"
      }
    ]
  }
] as const;
