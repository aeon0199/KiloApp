on run
  set projectPath to "/Users/joshmalone/Code/projects/KiloApp"
  set launchCmd to "cd " & quoted form of projectPath & " && if [ ! -d node_modules ]; then npm install; fi; pkill -f '/Users/joshmalone/Code/projects/KiloApp/node_modules/.bin/concurrently' >/dev/null 2>&1 || true; pkill -f '/Users/joshmalone/Code/projects/KiloApp/node_modules/.bin/vite' >/dev/null 2>&1 || true; pkill -f '/Users/joshmalone/Code/projects/KiloApp/node_modules/.bin/electron . --dev' >/dev/null 2>&1 || true; npm run dev"
  tell application "Terminal"
    activate
    do script launchCmd
  end tell
end run
