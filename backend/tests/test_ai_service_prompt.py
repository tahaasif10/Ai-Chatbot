import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.ai_service import SYSTEM_PROMPT


class StudyAssistantPromptTest(unittest.TestCase):
    def test_prompt_emphasizes_tutoring_and_uploaded_material(self):
        prompt = SYSTEM_PROMPT.lower()

        self.assertIn("study assistant", prompt)
        self.assertIn("uploaded", prompt)
        self.assertIn("primary source", prompt)
        self.assertIn("step by step", prompt)
        self.assertIn("redirect", prompt)


if __name__ == "__main__":
    unittest.main()
