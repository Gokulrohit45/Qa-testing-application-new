!macro customInit
  nsExec::Exec 'taskkill /F /T /IM "QA-AI Platform.exe"'
  nsExec::Exec 'taskkill /F /T /IM "qa-ai-engine.exe"'
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /T /IM "QA-AI Platform.exe"'
  nsExec::Exec 'taskkill /F /T /IM "qa-ai-engine.exe"'
!macroend
