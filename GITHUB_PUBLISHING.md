# Publish LocalLens to GitHub

## Recommended first setup

Create a new repository named `LocalLens` under your GitHub account. Start it as **Private**. Do not add a README, `.gitignore` or license through the GitHub website because these files are already in this project folder.

Extract the repository ZIP and open PowerShell in the extracted `LocalLens` project root. Check Git is installed:

```powershell
git --version
```

Then run:

```powershell
git init
git add .
git status
```

Before committing, make sure the staged list does not contain `.env`, `.env.local`, `locallens.db`, `.venv`, `node_modules`, model weights (`.pt`, `.pth`, `.onnx`) or private data. The `.gitignore` in this repository excludes these by default.

Commit and push:

```powershell
git commit -m "Initial LocalLens project"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/LocalLens.git
git push -u origin main
```

Replace `YOUR_GITHUB_USERNAME` with your GitHub username. GitHub may ask you to authenticate in a browser or through Git Credential Manager.

## If a Git remote already exists

Check it first:

```powershell
git remote -v
```

Do not overwrite an existing remote until you have confirmed where it points.

## Visibility and licence

Keep the repository Private until you have reviewed all source files, dependencies, images, data, API configuration and credentials. Select an explicit license before presenting the repository as open-source.
