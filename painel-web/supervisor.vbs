' Supervisor do painel web do Quase Nada Lembretes (sempre ligado).
' Roda o serve.mjs escondido e re-sobe se cair. Se o serve.mjs sair com 3,
' a porta ja tem outra instancia no ar -> este supervisor encerra.
' Disparado no login pelo QuaseNada-Lembretes-Painel.vbs na pasta Inicializar.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)

Do
  code = sh.Run("""C:\Program Files\nodejs\node.exe"" serve.mjs", 0, True)
  If code = 3 Then Exit Do
  WScript.Sleep 5000
Loop
