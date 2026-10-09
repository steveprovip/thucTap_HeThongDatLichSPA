import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('release_evidence', Path(__file__).with_name('release_evidence.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / 'docs/release'
        self.folder.mkdir(parents=True)
        self.source = self.root / 'topic.md'
        self.source.write_text('original topic', encoding='utf-8')
        self.data = dict(title='Test', date='2026-10-08', readiness='CHUA_NGHIEM_THU', scope='Scope',
            assignment_sources=[dict(path='topic.md', sha256=release.sha256(self.source), description='Original')],
            fixes=[], checks=[dict(status='PASS', command='python test.py', result='passed')], remaining=['staging'],
            domain_changes=['none'], directions=[], requirements=[dict(id='R1', title='Topic', source='topic.md', evidence='test', status='mapped')], research=[], inputs=[])
        self.save()

    def save(self):
        self.manifest = self.folder / 'release.json'
        self.manifest.write_text(json.dumps(self.data), encoding='utf-8')
        (self.folder / 'STATUS.md').write_text(release.render(self.data), encoding='utf-8')
        (self.folder / 'artifacts.json').write_text(json.dumps(dict(manifest_sha256=release.sha256(self.manifest), files=[])), encoding='utf-8')

    def test_consistent_manifest(self):
        self.assertEqual(release.validate(self.root, self.manifest), [])

    def test_changed_topic_invalidates_release(self):
        self.source.write_text('changed scope', encoding='utf-8')
        self.assertTrue(any('Stale evidence' in item for item in release.validate(self.root, self.manifest)))

    def test_changed_report_rejected(self):
        (self.folder / 'STATUS.md').write_text('all production ready', encoding='utf-8')
        self.assertTrue(any('STATUS.md differs' in item for item in release.validate(self.root, self.manifest)))

    def test_manifest_change_invalidates_slides(self):
        self.data['title'] = 'New title'
        self.manifest.write_text(json.dumps(self.data), encoding='utf-8')
        self.assertTrue(any('different release.json' in item for item in release.validate(self.root, self.manifest)))

    def test_duplicate_requirements_rejected(self):
        self.data['requirements'].append(copy.deepcopy(self.data['requirements'][0]))
        self.save()
        self.assertIn('Duplicate requirement ID', release.validate(self.root, self.manifest))

    def test_path_traversal_rejected(self):
        self.data['inputs'] = [dict(path='../../outside', sha256='bad')]
        self.save()
        self.assertTrue(any('escapes repository' in item for item in release.validate(self.root, self.manifest)))

    def test_false_production_claim_rejected(self):
        self.data['readiness'] = 'PRODUCTION_READY'
        self.save()
        self.assertTrue(any('Readiness conflicts' in item for item in release.validate(self.root, self.manifest)))

    def test_modified_artifact_rejected(self):
        artifact = self.folder / 'slides.pptx'
        artifact.write_bytes(b'original')
        index = dict(manifest_sha256=release.sha256(self.manifest), files=[dict(path='docs/release/slides.pptx', sha256=release.sha256(artifact))])
        (self.folder / 'artifacts.json').write_text(json.dumps(index), encoding='utf-8')
        artifact.write_bytes(b'modified')
        self.assertTrue(any('modified artifact' in item for item in release.validate(self.root, self.manifest)))

    def test_new_source_file_invalidates_snapshot(self):
        (self.root / 'src').mkdir()
        (self.root / 'src/app.py').write_text('v1', encoding='utf-8')
        self.data['snapshot_roots'] = ['src']
        self.data['inputs'] = release.snapshot(self.root, ['src'])
        self.save()
        (self.root / 'src/new.py').write_text('unverified', encoding='utf-8')
        self.assertTrue(any('file set changed' in item for item in release.validate(self.root, self.manifest)))


if __name__ == '__main__':
    unittest.main()
