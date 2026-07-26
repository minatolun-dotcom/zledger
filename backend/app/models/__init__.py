"""SQLAlchemy ORM models.

Auto-imports every module in this package (except base classes) so Alembic
autogenerate sees the full schema. No more import churn when adding models.
"""
from __future__ import annotations

import importlib
import pkgutil
import pathlib


_ignored = {"base", "__init__"}
_module_path = pathlib.Path(__file__).parent

for _finder, _modname, _ispkg in pkgutil.iter_modules([str(_module_path)]):
    if _modname not in _ignored:
        importlib.import_module(f".{_modname}", __package__)
del _finder, _modname, _ispkg, _module_path, _ignored
