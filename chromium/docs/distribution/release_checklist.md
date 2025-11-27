# Release Checklist for Blockd Browser

This document provides a comprehensive checklist for releasing a new version of Blockd Browser across all platforms.

## Pre-Release (2-3 weeks before)

### Code Freeze

- [ ] Set code freeze date
- [ ] Create release branch: `release/v1.0.1`
- [ ] Update version numbers in all files:
  - [ ] `chrome/VERSION`
  - [ ] `installer/windows/blocked_installer.nsi`
  - [ ] `installer/mac/Info.plist`
  - [ ] `installer/linux/debian/control`
  - [ ] `installer/linux/rpm/blockd-browser.spec`
- [ ] Update CHANGELOG.md with all changes since last release

### Testing

#### Unit & Integration Tests
- [ ] All unit tests pass: `npm test && pytest`
- [ ] All integration tests pass
- [ ] Code coverage ≥ 80%
- [ ] No critical bugs in issue tracker

#### Platform-Specific Testing

**Windows**
- [ ] Test on Windows 10 (64-bit)
- [ ] Test on Windows 11
- [ ] Verify process monitoring works
- [ ] Verify VM detection works
- [ ] Verify screen recorder detection works
- [ ] Test installer (fresh install + upgrade)
- [ ] Test uninstaller
- [ ] Verify auto-update works

**macOS**
- [ ] Test on macOS 12 (Monterey)
- [ ] Test on macOS 13 (Ventura)
- [ ] Test on macOS 14 (Sonoma)
- [ ] Test on Apple Silicon (M1/M2/M3)
- [ ] Test on Intel Mac
- [ ] Verify process monitoring works
- [ ] Verify VM detection works
- [ ] Verify screen recorder detection works
- [ ] Test DMG installer
- [ ] Verify Gatekeeper doesn't block
- [ ] Verify Sparkle updates work

**Linux**
- [ ] Test on Ubuntu 22.04 LTS
- [ ] Test on Ubuntu 24.04 LTS
- [ ] Test on Debian 12
- [ ] Test on Fedora 39
- [ ] Test .deb package
- [ ] Test .rpm package
- [ ] Test AppImage
- [ ] Verify process monitoring works
- [ ] Verify VM detection works
- [ ] Verify screen recorder detection works

#### Feature Testing

**Core Functionality**
- [ ] Browser launches successfully
- [ ] Can join interview session with valid token
- [ ] Fullscreen mode locks correctly
- [ ] Cannot exit fullscreen during session
- [ ] Cannot create new tabs during session
- [ ] Cannot switch windows during session
- [ ] Session ends properly

**Security Monitoring**
- [ ] Process detection works (test with OBS, TeamViewer)
- [ ] VM detection works (test on VMware, VirtualBox)
- [ ] Window focus tracking works
- [ ] Clipboard monitoring works
- [ ] Security events sent to backend correctly

**Eye Tracking**
- [ ] Camera permission requested
- [ ] MediaPipe loads and initializes
- [ ] Gaze data sent to backend at 30 FPS
- [ ] Off-screen detection works
- [ ] Eye tracking stops when session ends

**Video & Audio**
- [ ] Webcam capture works
- [ ] Microphone capture works
- [ ] Video stream sent to backend
- [ ] Video recording stored on backend
- [ ] Video playback works for interviewer

**AI Detection**
- [ ] Answer submission works
- [ ] AI similarity scores calculated
- [ ] Results displayed to interviewer
- [ ] False positive rate acceptable (<5%)

#### Performance Testing
- [ ] Memory usage < 500 MB idle, < 1 GB during session
- [ ] CPU usage < 30% idle, < 60% during session
- [ ] Browser startup time < 3 seconds
- [ ] Session join time < 5 seconds
- [ ] No memory leaks (run for 2+ hours)

#### Security Testing
- [ ] No XSS vulnerabilities
- [ ] No SQL injection vulnerabilities
- [ ] No CSRF vulnerabilities
- [ ] Dependency vulnerability scan clean (npm audit, Snyk)
- [ ] Code signing certificates valid
- [ ] TLS/HTTPS everywhere
- [ ] No secrets in Git history

## Build (1 week before)

### Windows Build

- [ ] Pull latest from release branch
- [ ] Apply Blockd modifications
- [ ] Configure build: `gn gen out/Release`
- [ ] Build: `ninja -C out/Release chrome`
- [ ] Build installer: `build_installer.bat`
- [ ] Code sign executable: `sign.bat`
- [ ] Code sign installer
- [ ] Verify signatures
- [ ] Test installer on clean Windows VM
- [ ] Calculate SHA-256 hash
- [ ] Upload to S3: `s3://downloads.blockd.com/windows/`

### macOS Build

- [ ] Pull latest from release branch
- [ ] Apply Blockd modifications
- [ ] Configure build: `gn gen out/Release`
- [ ] Build: `ninja -C out/Release chrome`
- [ ] Update Info.plist
- [ ] Code sign app bundle: `sign_and_notarize.sh`
- [ ] Submit for notarization (wait 15-30 min)
- [ ] Staple notarization ticket
- [ ] Verify signature and notarization
- [ ] Create DMG: `create_dmg.sh`
- [ ] Sign update for Sparkle
- [ ] Test DMG on clean macOS VM
- [ ] Calculate SHA-256 hash
- [ ] Upload to S3: `s3://downloads.blockd.com/macos/`

### Linux Build

- [ ] Pull latest from release branch
- [ ] Apply Blockd modifications
- [ ] Configure build: `gn gen out/Release`
- [ ] Build: `ninja -C out/Release chrome`

**Debian Package**
- [ ] Create .deb package structure
- [ ] Build package: `dpkg-deb --build`
- [ ] Sign package: `dpkg-sig --sign`
- [ ] Test on Ubuntu 22.04 VM
- [ ] Test on Debian 12 VM
- [ ] Calculate SHA-256 hash
- [ ] Upload to S3

**RPM Package**
- [ ] Create .rpm package structure
- [ ] Build package: `rpmbuild -ba`
- [ ] Sign package: `rpm --addsign`
- [ ] Test on Fedora 39 VM
- [ ] Calculate SHA-256 hash
- [ ] Upload to S3

**AppImage**
- [ ] Build AppImage: `build_appimage.sh`
- [ ] Test on Ubuntu, Fedora, Arch
- [ ] Calculate SHA-256 hash
- [ ] Upload to S3

## Update Server Configuration

### Windows (Omaha)

- [ ] Update `omaha_config.xml` with new version
- [ ] Update download URL
- [ ] Update SHA-256 hash
- [ ] Update file size
- [ ] Deploy to `https://update.blockd.com/service/update2`
- [ ] Test update check from v1.0.0 to v1.0.1

### macOS (Sparkle)

- [ ] Generate EdDSA signature for DMG
- [ ] Update `appcast.xml`:
  - [ ] Version number
  - [ ] Release date
  - [ ] Download URL
  - [ ] EdDSA signature
  - [ ] File size
  - [ ] Release notes link
- [ ] Deploy to `https://update.blockd.com/macos/appcast.xml`
- [ ] Test update check from v1.0.0 to v1.0.1

### Linux (Custom)

- [ ] Update `latest.json`:
  - [ ] Version number
  - [ ] Release date
  - [ ] Download URLs for all formats
  - [ ] SHA-256 hashes
  - [ ] File sizes
  - [ ] Changelog
- [ ] Deploy to `https://update.blockd.com/linux/latest.json`
- [ ] Test update check from v1.0.0 to v1.0.1

## Documentation

- [ ] Update README.md
- [ ] Update CHANGELOG.md
- [ ] Create release notes page: `https://blockd.com/release-notes/1.0.1.html`
- [ ] Update documentation site
- [ ] Update FAQ if needed
- [ ] Create release announcement blog post

## Marketing

- [ ] Prepare release announcement
- [ ] Update website download links
- [ ] Prepare social media posts
- [ ] Notify beta users via email
- [ ] Prepare changelog for in-app display

## Release Day

### Final Checks

- [ ] All builds completed and uploaded
- [ ] All signatures verified
- [ ] Update servers configured
- [ ] Documentation updated
- [ ] Release notes published

### Deploy

**9:00 AM PST - Update Servers**
- [ ] Deploy Windows update manifest (5% rollout)
- [ ] Deploy macOS appcast (5% rollout)
- [ ] Deploy Linux update manifest (5% rollout)
- [ ] Monitor error rates

**10:00 AM PST - Download Page**
- [ ] Update website download links
- [ ] Test download links from website
- [ ] Verify SHA-256 hashes match

**11:00 AM PST - Staged Rollout**
- [ ] Increase rollout to 25%
- [ ] Monitor crash reports
- [ ] Monitor update success rate
- [ ] Check for user reports on social media

**2:00 PM PST - Announcements**
- [ ] Publish blog post
- [ ] Post on Twitter/X
- [ ] Post on LinkedIn
- [ ] Send email to subscribers
- [ ] Update status page

**4:00 PM PST - Full Rollout**
- [ ] Increase rollout to 100%
- [ ] Monitor for issues
- [ ] Respond to user questions

### Monitoring (First 24 Hours)

- [ ] Monitor crash reports (target: <0.1% crash rate)
- [ ] Monitor update success rate (target: >95%)
- [ ] Monitor download counts
- [ ] Track version distribution
- [ ] Monitor error logs
- [ ] Check social media for user feedback
- [ ] Respond to GitHub issues

## Post-Release (Week After)

### Analytics Review

- [ ] Download counts by platform
- [ ] Update adoption rate
- [ ] Crash reports analysis
- [ ] User feedback summary
- [ ] Performance metrics compared to previous version

### Retrospective

- [ ] What went well?
- [ ] What could be improved?
- [ ] Any issues encountered?
- [ ] Update release checklist based on learnings

### Repository Maintenance

- [ ] Tag release: `git tag v1.0.1`
- [ ] Push tag: `git push origin v1.0.1`
- [ ] Create GitHub release with binaries
- [ ] Merge release branch back to main
- [ ] Close milestone in issue tracker
- [ ] Archive old builds (keep last 3 versions)

## Rollback Procedure (If Needed)

If critical issues are discovered:

1. **Immediate Actions**
   - [ ] Pause rollout (set to 0%)
   - [ ] Post status update
   - [ ] Notify engineering team

2. **Investigate**
   - [ ] Identify root cause
   - [ ] Determine severity
   - [ ] Assess user impact

3. **Rollback Decision**
   - [ ] If critical: Rollback to previous version
   - [ ] If minor: Plan hotfix release

4. **Rollback Execution**
   - [ ] Revert update manifests to previous version
   - [ ] Clear CDN cache
   - [ ] Notify users of rollback
   - [ ] Post incident report

5. **Hotfix (If Applicable)**
   - [ ] Create hotfix branch from release tag
   - [ ] Apply fix
   - [ ] Fast-track testing
   - [ ] Release as v1.0.1.1

## Emergency Contacts

- **Release Manager**: release-manager@blockd.com
- **Engineering Lead**: engineering@blockd.com
- **DevOps On-Call**: +1-555-BLOCKD
- **Security Team**: security@blockd.com
- **PagerDuty**: Escalate via PagerDuty app

## Version Numbering

Blockd Browser follows Semantic Versioning:
- **Major** (1.x.x): Breaking changes, major features
- **Minor** (x.1.x): New features, non-breaking changes
- **Patch** (x.x.1): Bug fixes, security patches
- **Hotfix** (x.x.x.1): Critical emergency fixes

Examples:
- `1.0.0` → Initial release
- `1.0.1` → Bug fixes
- `1.1.0` → New features
- `2.0.0` → Major rewrite

## Release Schedule

- **Major releases**: Every 6 months (aligned with Chromium major releases)
- **Minor releases**: Monthly or as needed
- **Patch releases**: As needed for bug fixes
- **Security patches**: Within 48 hours of disclosure
- **Chromium rebases**: Every 6 weeks (aligned with Chromium stable)

## Sign-Off

Before release, obtain sign-off from:

- [ ] Engineering Lead
- [ ] QA Lead
- [ ] Security Team
- [ ] Product Manager
- [ ] Release Manager

**Release Approved By:**
- Engineering: _________________ Date: _______
- QA: _________________ Date: _______
- Security: _________________ Date: _______
- Product: _________________ Date: _______
- Release Manager: _________________ Date: _______

---

**Version**: 1.0
**Last Updated**: 2025-11-24
**Maintained By**: Release Engineering Team
