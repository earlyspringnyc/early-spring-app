/* Cross-project staffing utilities */

export function getProjectStaff(project, teamMembers = []) {
  const map = new Map();

  // Auto-detect from timeline task owners
  (project.timeline || []).forEach(task => {
    const owner = task.owner || task.assignee;
    if (!owner) return;
    const member = teamMembers.find(m => m.name === owner || m.id === owner || m.email === owner);
    const key = member?.id || owner;
    if (!map.has(key)) {
      map.set(key, {
        userId: member?.id || null,
        name: member?.name || owner,
        role: member?.role || '',
        avatar: member?.avatar || member?.avatar_url || '',
        source: 'timeline',
      });
    }
  });

  // Manual staffing entries supplement / override
  (project.staffing || []).forEach(s => {
    const key = s.userId || s.name;
    if (map.has(key)) {
      map.set(key, { ...map.get(key), ...s, source: 'both' });
    } else {
      map.set(key, { ...s, source: 'manual' });
    }
  });

  return [...map.values()];
}

export function getCrossProjectStaffing(projects, teamMembers = []) {
  // Returns Map<personKey, { name, avatar, projects: [{ projectId, projectName, role }] }>
  const grid = new Map();

  projects.forEach(p => {
    if (p.stage === 'archived') return;
    const staff = getProjectStaff(p, teamMembers);
    staff.forEach(s => {
      const key = s.userId || s.name;
      if (!grid.has(key)) {
        grid.set(key, { name: s.name, avatar: s.avatar, projects: [] });
      }
      grid.get(key).projects.push({
        projectId: p.id,
        projectName: p.name,
        role: s.role,
      });
    });
  });

  return grid;
}
