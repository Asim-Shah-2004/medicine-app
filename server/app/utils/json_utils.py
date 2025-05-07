from flask.json.provider import JSONProvider
from bson import ObjectId
from datetime import datetime, date
import json

class MongoJSONProvider(JSONProvider):
    """Custom JSON provider that handles MongoDB ObjectId and datetime serialization for Flask 3.1.0+."""
    
    def dumps(self, obj, **kwargs):
        return json.dumps(obj, default=self._handle_object, **kwargs)
    
    def loads(self, s, **kwargs):
        return json.loads(s, **kwargs)
    
    def _handle_object(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        elif isinstance(obj, (datetime, date)):
            return obj.isoformat()
        # Try to handle more complex objects by converting to dict
        try:
            return dict(obj)
        except (TypeError, ValueError):
            pass
        # If no conversion is available
        raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")
