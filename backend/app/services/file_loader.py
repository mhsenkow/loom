"""
File loader service for DATA cells
Supports multiple file formats with appropriate parsing
"""

import os
import json
import csv
import logging
from pathlib import Path
from typing import Optional, Literal
import base64
import mimetypes

# Try importing optional PDF support
try:
    import fitz  # PyMuPDF
    HAS_PDF = True
except ImportError:
    HAS_PDF = False


FileReadMode = Literal['raw', 'lines', 'json', 'csv', 'pdf', 'base64', 'auto']
logger = logging.getLogger("loom.file_loader")


class FileLoaderService:
    """
    Service for loading files from the data folder
    """
    
    def __init__(self, data_folder: Optional[str] = None):
        self.data_folder = Path(data_folder) if data_folder else None
    
    def set_data_folder(self, path: str, create: bool = False):
        """Set the data folder path, optionally creating it"""
        folder = Path(path).expanduser().resolve()
        
        if create and not folder.exists():
            try:
                folder.mkdir(parents=True, exist_ok=True)
                logger.info("data_folder_created path=%s", folder)
            except Exception as e:
                logger.exception("data_folder_create_failed path=%s", folder)
                return False
        
        if folder.exists() and folder.is_dir():
            self.data_folder = folder
            return True
        return False
    
    def get_data_folder(self) -> Optional[str]:
        """Get current data folder path"""
        return str(self.data_folder) if self.data_folder else None
    
    def list_files(self, subfolder: str = "", extensions: Optional[list[str]] = None) -> list[dict]:
        """
        List files in the data folder
        Returns list of {name, path, size, type, modified}
        """
        if not self.data_folder:
            return []
        
        target = self.data_folder / subfolder if subfolder else self.data_folder
        
        if not target.exists():
            return []
        
        files = []
        for item in sorted(target.iterdir()):
            if item.name.startswith('.'):
                continue
                
            # Filter by extension if specified
            if extensions and item.is_file():
                if item.suffix.lower().lstrip('.') not in extensions:
                    continue
            
            mime_type, _ = mimetypes.guess_type(str(item))
            
            files.append({
                'name': item.name,
                'path': str(item.relative_to(self.data_folder)),
                'is_dir': item.is_dir(),
                'size': item.stat().st_size if item.is_file() else 0,
                'type': self._get_file_type(item),
                'mime': mime_type,
                'modified': item.stat().st_mtime,
            })
        
        return files
    
    def _get_file_type(self, path: Path) -> str:
        """Determine file type from extension"""
        if path.is_dir():
            return 'folder'
        
        ext = path.suffix.lower()
        type_map = {
            '.txt': 'text',
            '.md': 'markdown',
            '.json': 'json',
            '.csv': 'csv',
            '.tsv': 'csv',
            '.pdf': 'pdf',
            '.py': 'code',
            '.js': 'code',
            '.ts': 'code',
            '.tsx': 'code',
            '.jsx': 'code',
            '.html': 'code',
            '.css': 'code',
            '.sql': 'code',
            '.sh': 'code',
            '.yaml': 'code',
            '.yml': 'code',
            '.toml': 'code',
            '.xml': 'code',
            '.png': 'image',
            '.jpg': 'image',
            '.jpeg': 'image',
            '.gif': 'image',
            '.webp': 'image',
            '.svg': 'image',
        }
        return type_map.get(ext, 'text')
    
    def read_file(
        self, 
        file_path: str, 
        mode: FileReadMode = 'auto',
        max_chars: int = 100000,
    ) -> dict:
        """
        Read a file with the specified mode
        Returns {content, type, lines, size, truncated}
        """
        if not self.data_folder:
            raise ValueError("Data folder not configured")
        
        full_path = self.data_folder / file_path
        
        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        if not full_path.is_file():
            raise ValueError(f"Not a file: {file_path}")
        
        # Security: ensure path is within data folder
        try:
            full_path.resolve().relative_to(self.data_folder.resolve())
        except ValueError:
            raise ValueError("Access denied: path outside data folder")
        
        file_type = self._get_file_type(full_path)
        file_size = full_path.stat().st_size
        
        # Auto-detect mode based on file type
        if mode == 'auto':
            mode = self._auto_mode(file_type)
        
        content = ""
        metadata = {
            'type': file_type,
            'size': file_size,
            'path': file_path,
            'mode': mode,
            'truncated': False,
        }
        
        try:
            if mode == 'raw' or mode == 'lines':
                content = self._read_text(full_path, max_chars)
                if len(content) >= max_chars:
                    metadata['truncated'] = True
                if mode == 'lines':
                    metadata['line_count'] = content.count('\n') + 1
                    
            elif mode == 'json':
                content = self._read_json(full_path)
                
            elif mode == 'csv':
                content = self._read_csv(full_path, max_chars)
                
            elif mode == 'pdf':
                content = self._read_pdf(full_path, max_chars)
                if len(content) >= max_chars:
                    metadata['truncated'] = True
                    
            elif mode == 'base64':
                content = self._read_base64(full_path)
                metadata['encoding'] = 'base64'
                
            else:
                content = self._read_text(full_path, max_chars)
                
        except Exception as e:
            raise RuntimeError(f"Error reading file: {e}")
        
        return {
            'content': content,
            **metadata,
        }
    
    def _auto_mode(self, file_type: str) -> FileReadMode:
        """Auto-detect read mode from file type"""
        mode_map = {
            'json': 'json',
            'csv': 'csv',
            'pdf': 'pdf',
            'image': 'base64',
        }
        return mode_map.get(file_type, 'raw')
    
    def _read_text(self, path: Path, max_chars: int) -> str:
        """Read text file with size limit"""
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            return f.read(max_chars)
    
    def _read_json(self, path: Path) -> str:
        """Read and pretty-print JSON"""
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return json.dumps(data, indent=2, ensure_ascii=False)
    
    def _read_csv(self, path: Path, max_chars: int) -> str:
        """Read CSV and format as readable table"""
        rows = []
        with open(path, 'r', encoding='utf-8', errors='replace', newline='') as f:
            # Detect delimiter
            sample = f.read(4096)
            f.seek(0)
            
            delimiter = ','
            if path.suffix.lower() == '.tsv' or sample.count('\t') > sample.count(','):
                delimiter = '\t'
            
            reader = csv.reader(f, delimiter=delimiter)
            total_chars = 0
            
            for i, row in enumerate(reader):
                row_str = ' | '.join(str(cell)[:50] for cell in row)
                
                if i == 0:
                    # Header
                    rows.append(row_str)
                    rows.append('-' * len(row_str))
                else:
                    rows.append(row_str)
                
                total_chars += len(row_str)
                if total_chars > max_chars:
                    rows.append(f'... (truncated, {i} rows shown)')
                    break
        
        return '\n'.join(rows)
    
    def _read_pdf(self, path: Path, max_chars: int) -> str:
        """Extract text from PDF"""
        if not HAS_PDF:
            return "[PDF support not installed. Run: pip install pymupdf]"
        
        doc = fitz.open(str(path))
        text_parts = []
        total_chars = 0
        
        for page_num, page in enumerate(doc):
            text = page.get_text()
            text_parts.append(f"--- Page {page_num + 1} ---\n{text}")
            total_chars += len(text)
            
            if total_chars > max_chars:
                text_parts.append(f"\n... (truncated at page {page_num + 1})")
                break
        
        doc.close()
        return '\n'.join(text_parts)
    
    def _read_base64(self, path: Path) -> str:
        """Read file as base64"""
        with open(path, 'rb') as f:
            data = f.read()
        
        mime_type, _ = mimetypes.guess_type(str(path))
        b64 = base64.b64encode(data).decode('utf-8')
        
        if mime_type:
            return f"data:{mime_type};base64,{b64}"
        return b64


# Singleton instance
file_loader = FileLoaderService()
