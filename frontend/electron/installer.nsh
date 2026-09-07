; Use electron-builder's application-in-use handling. Never terminate processes
; by executable name: another preview or active test may use the same runner.
; Locked files must be resolved by closing that application, not a broad kill.
