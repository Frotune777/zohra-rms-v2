import os

# Directories and file types to exclude
# EXCLUDED_DIRS = {'.venv', '__pycache__', '.git', 'node_modules', '.idea', '.vscode'}
EXCLUDED_EXTENSIONS = {'.pyc', '.pyo'}
# Update this section in your structure.py
EXCLUDED_DIRS = {
    '.git', 
    '.venv', 
    '__pycache__', 
    'node_modules',  # Crucial for your client/ and server/ folders
    '.idea', 
    '.vscode', 
    'dist',          # Exclude build artifacts
    'coverage'       # Exclude test coverage reports
}

def format_size(bytes_size):
    return f"{bytes_size / 1024:.1f} KB"

def should_exclude(item, base_path):
    path = os.path.join(base_path, item)
    if os.path.isdir(path) and item in EXCLUDED_DIRS:
        return True
    if os.path.isfile(path) and os.path.splitext(item)[1] in EXCLUDED_EXTENSIONS:
        return True
    return False

def generate_tree(start_path, prefix=""):
    output = []
    try:
        # Sort items to make the tree deterministic
        items = sorted([i for i in os.listdir(start_path) if not should_exclude(i, start_path)])
    except PermissionError:
        return [prefix + "└── [Permission Denied]"]

    for index, item in enumerate(items):
        path = os.path.join(start_path, item)
        is_last = (index == len(items) - 1)
        connector = "└── " if is_last else "├── "
        display_name = item

        if os.path.isfile(path):
            size_kb = format_size(os.path.getsize(path))
            display_name += f" ({size_kb})"

        output.append(prefix + connector + display_name)

        if os.path.isdir(path):
            extension = "    " if is_last else "│   "
            output.extend(generate_tree(path, prefix + extension))
    return output

# --- Main Execution ---

# Automatically gets the current working directory
project_root = os.getcwd() 
structure_file = os.path.join(project_root, "structure.txt")

print(f"Scanning directory: {project_root}...")

tree_lines = [f"📁 Project structure for: {project_root} (with file sizes)"]
tree_lines.extend(generate_tree(project_root))

with open(structure_file, "w", encoding="utf-8") as f:
    f.write("\n".join(tree_lines))

print(f"[✓] Project structure saved to: {structure_file}")