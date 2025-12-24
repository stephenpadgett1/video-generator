const { useState, useEffect } = React;

const HOLD_MUSIC_PROJECT = {
  project_id: "hold_music_v1",
  title: "HOLD MUSIC",
  concept: "A customer waits on hold. Forever.",
  aspect_ratio: "9:16",
  target_duration: 35,
  shots: [
    {
      shot_id: "shot_1",
      duration_target: 6,
      veo_prompt: "Close-up of a landline phone handset lying on a desk, cord coiled. Hold music faintly audible concept. Office desk with coffee ring stains, fluorescent lighting. Documentary realism, shallow depth of field, 4K.",
      vo: null,
      status: "pending",
      selected_option: null,
      retries: 0
    },
    {
      shot_id: "shot_2",
      duration_target: 7,
      veo_prompt: "Fingers drumming slowly on a desk next to a phone. Wedding ring visible. Waiting. Slow, restless rhythm. Close-up on hand, soft office lighting, mundane tension, 4K corporate documentary style.",
      vo: { text: "Your call is important to us.", timing: "end", target_seconds: 3 },
      status: "pending",
      selected_option: null,
      retries: 0
    },
    {
      shot_id: "shot_3",
      duration_target: 7,
      veo_prompt: "Wall clock in a beige office. Second hand ticking. Time-lapse clouds visible through window behind it. The clock hands don't move but the clouds race. Surreal mundane, liminal office space, 4K.",
      vo: { text: "Please continue to hold.", timing: "middle", target_seconds: 2.5 },
      status: "pending",
      selected_option: null,
      retries: 0
    },
    {
      shot_id: "shot_4",
      duration_target: 8,
      veo_prompt: "A desk plant slowly wilting in time-lapse. Phone handset still in frame, out of focus in foreground. Office light shifts from day to golden hour to dusk. Passage of time, melancholic, 4K.",
      vo: { text: "You are currently caller number... eight million.", timing: "start", target_seconds: 4 },
      status: "pending",
      selected_option: null,
      retries: 0
    },
    {
      shot_id: "shot_5",
      duration_target: 5,
      veo_prompt: "The phone handset from shot 1, same framing. Dust has accumulated on the desk. The coffee ring is darker, older. Nothing else has changed. Subtle horror of stasis, 4K documentary realism.",
      vo: { text: "A representative will be with you shortly.", timing: "end", target_seconds: 3 },
      referenceShot: "shot_1",
      status: "pending",
      selected_option: null,
      retries: 0
    }
  ],
  title_card: {
    duration: 4,
    text: "HOLD MUSIC",
    style: "White sans-serif on black, fade in",
    status: "pending"
  },
  music: {
    description: "Generic corporate hold music - smooth jazz, deliberately bland, slightly too loud in the mix.",
    status: "pending"
  },
  vo_direction: {
    voice: "Female, neutral American, calm, professional. Complete sincerity.",
    generation_attempts: 3
  }
};

const MAX_RETRIES = 3;

function VideoPipelineControl() {
  const [project, setProject] = useState(null);
  const [activeShot, setActiveShot] = useState(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [uploadedOptions, setUploadedOptions] = useState({});
  const [assemblyInstructions, setAssemblyInstructions] = useState(null);
  const [aiReviewLoading, setAiReviewLoading] = useState({});  // { shotId: true/false }
  const [aiReviewResult, setAiReviewResult] = useState({});    // { shotId: result }
  const [selectedForAssembly, setSelectedForAssembly] = useState({});  // { shotId: optionNum }
  const [storageStatus, setStorageStatus] = useState('loading');
  const [generatorMode, setGeneratorMode] = useState(false);
  const [generatorLoading, setGeneratorLoading] = useState(false);
  const [generatorBrief, setGeneratorBrief] = useState('');
  const [youtubeMetadata, setYoutubeMetadata] = useState(null);
  const [youtubeMetadataLoading, setYoutubeMetadataLoading] = useState(false);

  // Load state from server on mount
  useEffect(() => {
    const loadState = async () => {
      try {
        // Load config
        const configRes = await fetch('/api/config');
        const config = await configRes.json();
        
        if (config.elevenLabsKey) setElevenLabsKey(config.elevenLabsKey);
        if (config.claudeKey) setClaudeKey(config.claudeKey);
        if (config.veoServiceAccountPath) setVeoKey(config.veoServiceAccountPath);
        if (config.veoApiKey) setVeoApiKey(config.veoApiKey);
        if (config.selectedVoice) setSelectedVoice(config.selectedVoice);
        if (config.uploadedOptions) setUploadedOptions(config.uploadedOptions);
        if (config.assemblyInstructions) setAssemblyInstructions(config.assemblyInstructions);
        if (config.selectedForAssembly) setSelectedForAssembly(config.selectedForAssembly);
        if (config.aiReviewResult) setAiReviewResult(config.aiReviewResult);
        
        // Load current project
        const projectRes = await fetch('/api/project');
        const project = await projectRes.json();
        if (project) setProject(project);
        
        setStorageStatus('loaded');
      } catch (err) {
        console.log('Error loading state:', err);
        setStorageStatus('new');
      }
    };
    loadState();
  }, []);

  // Save project state when it changes
  useEffect(() => {
    if (storageStatus === 'loading') return;
    if (project === null) return;
    const saveProject = async () => {
      try {
        await fetch('/api/project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(project)
        });
      } catch (err) {
        console.error('Failed to save project:', err);
      }
    };
    saveProject();
  }, [project, storageStatus]);

  // Save uploaded options when they change
  useEffect(() => {
    if (storageStatus === 'loading') return;
    const saveOptions = async () => {
      try {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadedOptions })
        });
      } catch (err) {
        console.error('Failed to save options:', err);
      }
    };
    saveOptions();
  }, [uploadedOptions, storageStatus]);

  // Save selected for assembly when it changes
  useEffect(() => {
    if (storageStatus === 'loading') return;
    if (Object.keys(selectedForAssembly).length === 0) return; // Don't save empty state
    const saveSelections = async () => {
      try {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedForAssembly })
        });
      } catch (err) {
        console.error('Failed to save selections:', err);
      }
    };
    saveSelections();
  }, [selectedForAssembly, storageStatus]);

  // Save AI review results when they change
  useEffect(() => {
    if (storageStatus === 'loading') return;
    if (Object.keys(aiReviewResult).length === 0) return; // Don't save empty state
    const saveReviews = async () => {
      try {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aiReviewResult })
        });
      } catch (err) {
        console.error('Failed to save reviews:', err);
      }
    };
    saveReviews();
  }, [aiReviewResult, storageStatus]);

  // Save assembly instructions when generated
  useEffect(() => {
    if (storageStatus === 'loading' || !assemblyInstructions) return;
    const saveAssembly = async () => {
      try {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assemblyInstructions })
        });
      } catch (err) {
        console.error('Failed to save assembly:', err);
      }
    };
    saveAssembly();
  }, [assemblyInstructions, storageStatus]);

  const [confirmReset, setConfirmReset] = useState(false);
  const [showPromptExport, setShowPromptExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [elevenLabsKey, setElevenLabsKey] = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [veoKey, setVeoKey] = useState('');
  const [veoApiKey, setVeoApiKey] = useState('');
  const [elevenLabsVoices, setElevenLabsVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [voGenerating, setVoGenerating] = useState(false);
  const [veoGenerating, setVeoGenerating] = useState({});
  const [veoStatus, setVeoStatus] = useState({});
  const [describingVideo, setDescribingVideo] = useState({});
  const [assembling, setAssembling] = useState(false);
  const [assemblyResult, setAssemblyResult] = useState(null);

  // Handle AI video description
  const handleDescribeVideo = async (shotId, optionNum) => {
    const key = `${shotId}-${optionNum}`;
    setDescribingVideo(prev => ({ ...prev, [key]: true }));
    
    try {
      const options = uploadedOptions[shotId] || {};
      const videoPath = options[optionNum]?.videoPath;
      
      if (!videoPath) {
        throw new Error('No video path found');
      }
      
      // Get the original Veo prompt for this shot
      const shot = project?.shots?.find(s => s.shot_id === shotId);
      const originalPrompt = shot?.veo_prompt || shot?.description || '';
      
      const response = await fetch('/api/gemini/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoPath, originalPrompt })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }
      
      const data = await response.json();
      
      // Save description to audioDescription field (and keep a copy in aiDescription for reference)
      setUploadedOptions(prev => ({
        ...prev,
        [shotId]: {
          ...prev[shotId],
          [optionNum]: {
            ...prev[shotId]?.[optionNum],
            audioDescription: data.description,
            aiDescriptionModel: data.model
          }
        }
      }));
    } catch (err) {
      console.error('Video description error:', err);
      alert('Failed to describe video: ' + err.message);
    } finally {
      setDescribingVideo(prev => ({ ...prev, [key]: false }));
    }
  };

  // Handle selecting an option for assembly
  const handleSelectForAssembly = (shotId, optionNum) => {
    const isSelecting = selectedForAssembly[shotId] !== optionNum;
    setSelectedForAssembly(prev => ({
      ...prev,
      [shotId]: prev[shotId] === optionNum ? null : optionNum  // Toggle selection
    }));
    
    // Auto-select VO when selecting (not deselecting)
    if (isSelecting) {
      autoSelectVoTake(shotId, optionNum);
    }
  };

  // Handle video assembly
  const handleAssemble = async () => {
    if (!project?.shots) return;
    
    // Build shots array in order
    const shots = [];
    for (const shot of project.shots) {
      const selectedOption = selectedForAssembly[shot.shot_id];
      if (selectedOption) {
        const options = uploadedOptions[shot.shot_id] || {};
        const videoPath = options[selectedOption]?.videoPath;
        if (videoPath) {
          const videoDuration = parseFloat(options[selectedOption]?.duration) || 999;
          
          // Find VO take for this shot
          const voTakes = options.voTakes || [];
          
          // First check for manually selected VO
          let selectedVo = voTakes.find(take => take.selected);
          
          // If no manual selection, auto-select first VO that fits within video duration
          if (!selectedVo && voTakes.length > 0) {
            selectedVo = voTakes.find(take => {
              const voDuration = parseFloat(take.duration) || 0;
              return voDuration <= videoDuration;
            });
          }
          
          shots.push({
            shotId: shot.shot_id,
            videoPath: videoPath,
            voPath: selectedVo?.audioUrl || null,
            duration: options[selectedOption]?.duration
          });
        }
      }
    }
    
    if (shots.length === 0) {
      alert('No shots selected for assembly. Select at least one option.');
      return;
    }
    
    setAssembling(true);
    setAssemblyResult(null);
    
    try {
      const response = await fetch('/api/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shots,
          outputFilename: `${project.project_id}_assembled_${Date.now()}.mp4`
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Assembly failed');
      }
      
      const result = await response.json();
      setAssemblyResult(result);
    } catch (err) {
      console.error('Assembly error:', err);
      alert('Assembly failed: ' + err.message);
    } finally {
      setAssembling(false);
    }
  };

  const generateYoutubeMetadata = async () => {
    if (!project) return;
    
    setYoutubeMetadataLoading(true);
    
    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: `Generate YouTube Shorts metadata for this AI-generated video project.

PROJECT TITLE: ${project.title}
CONCEPT: ${project.concept}
DURATION: ~${project.target_duration} seconds
ASPECT RATIO: ${project.aspect_ratio}

SHOTS:
${project.shots.map(s => `- ${s.shot_id}: ${s.veo_prompt}${s.vo ? ` [VO: "${s.vo.text}"]` : ''}`).join('\n')}

Generate metadata optimized for YouTube Shorts discovery. Return JSON only:
{
  "title": "Catchy title under 100 characters, include emoji if appropriate",
  "description": "Engaging description with context about the piece. Include a note that this was created with AI tools (Veo, Claude, ElevenLabs). 2-3 short paragraphs max. Include relevant hashtags at the end.",
  "tags": ["array", "of", "relevant", "tags", "for", "youtube", "max", "15"]
}`
          }]
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate metadata');
      }
      
      const data = await response.json();
      const text = data.content.map(c => c.text || '').join('');
      const cleaned = text.replace(/```json|```/g, '').trim();
      const metadata = JSON.parse(cleaned);
      
      setYoutubeMetadata(metadata);
    } catch (err) {
      console.error('YouTube metadata error:', err);
      alert('Failed to generate metadata: ' + err.message);
    } finally {
      setYoutubeMetadataLoading(false);
    }
  };

  const resetProject = async () => {
    try {
      await fetch('/api/project', { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to clear project:', err);
    }
    setProject(null);
    setUploadedOptions({});
    setAssemblyInstructions(null);
    setActiveShot(null);
    setConfirmReset(false);
    setSelectedForAssembly({});
    setAiReviewResult({});
  };

  const generateNewProject = async () => {
    setGeneratorLoading(true);
    
    const briefText = generatorBrief.trim() || "Dealer's choice. Surprise me with something that fits the short-form vertical video format.";
    
    const prompt = `You are generating a project specification for an autonomous short-form video pipeline.

BRIEF FROM USER: ${briefText}

Generate a complete project in this exact JSON structure. The video should be 30-60 seconds, 9:16 aspect ratio, suitable for YouTube Shorts.

Requirements:
- 4-6 shots
- Each shot needs a detailed Veo prompt (concrete visual descriptions, lighting, style notes)
- VO should be sparse and impactful - not every shot needs VO
- Total VO should fit the timing naturally
- Tone: aim for something with conceptual depth, visual interest, and a point of view
- Avoid cliches. Find an interesting angle.

Respond with ONLY valid JSON, no markdown, no explanation:

{
  "project_id": "snake_case_name",
  "title": "DISPLAY TITLE",
  "concept": "One sentence description",
  "aspect_ratio": "9:16",
  "target_duration": 45,
  "shots": [
    {
      "shot_id": "shot_1",
      "duration_target": 8,
      "veo_prompt": "Detailed prompt for Veo video generation...",
      "vo": null,
      "status": "pending",
      "selected_option": null,
      "retries": 0
    },
    {
      "shot_id": "shot_2",
      "duration_target": 7,
      "veo_prompt": "Another detailed prompt...",
      "vo": { "text": "Short VO line.", "timing": "end", "target_seconds": 3 },
      "status": "pending",
      "selected_option": null,
      "retries": 0
    }
  ],
  "title_card": {
    "duration": 4,
    "text": "TITLE HERE",
    "style": "Description of title card style",
    "status": "pending"
  },
  "music": {
    "description": "Description of music style and mood",
    "status": "pending"
  },
  "vo_direction": {
    "voice": "Description of voice characteristics",
    "generation_attempts": 3
  },
  "metadata": {
    "title": "YouTube title",
    "description": "YouTube description with credits",
    "tags": ["tag1", "tag2", "tag3"]
  }
}`;

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.content.map(c => c.text || '').join('');
      const cleaned = text.replace(/```json|```/g, '').trim();
      const newProject = JSON.parse(cleaned);
      
      setProject(newProject);
      setUploadedOptions({});
      setAssemblyInstructions(null);
      setActiveShot(null);
      setGeneratorMode(false);
      setGeneratorBrief('');
      
    } catch (err) {
      console.error('Project generation error:', err);
      alert('Failed to generate project: ' + err.message);
    }
    
    setGeneratorLoading(false);
  };

  const updateShotStatus = (shotId, status, selectedOption = null) => {
    setProject(prev => ({
      ...prev,
      shots: prev.shots.map(shot =>
        shot.shot_id === shotId
          ? { ...shot, status, selected_option: selectedOption }
          : shot
      )
    }));
  };

  const incrementRetry = (shotId) => {
    setProject(prev => ({
      ...prev,
      shots: prev.shots.map(shot =>
        shot.shot_id === shotId
          ? { ...shot, retries: shot.retries + 1 }
          : shot
      )
    }));
  };

  const handleImageUpload = (shotId, optionNum, e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedOptions(prev => ({
          ...prev,
          [shotId]: {
            ...prev[shotId],
            [optionNum]: {
              ...prev[shotId]?.[optionNum],
              dataUrl: event.target.result,
              filename: file.name
            }
          }
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAudioDescription = (shotId, optionNum, field, value) => {
    setUploadedOptions(prev => ({
      ...prev,
      [shotId]: {
        ...prev[shotId],
        [optionNum]: {
          ...prev[shotId]?.[optionNum],
          [field]: value
        }
      }
    }));
  };

  const addVoTake = (shotId) => {
    setUploadedOptions(prev => {
      const shotData = prev[shotId] || {};
      const voTakes = shotData.voTakes || [];
      return {
        ...prev,
        [shotId]: {
          ...shotData,
          voTakes: [...voTakes, { duration: '', notes: '', selected: false }]
        }
      };
    });
  };

  const updateVoTake = (shotId, takeIndex, field, value) => {
    setUploadedOptions(prev => {
      const shotData = prev[shotId] || {};
      const voTakes = [...(shotData.voTakes || [])];
      voTakes[takeIndex] = { ...voTakes[takeIndex], [field]: value };
      return {
        ...prev,
        [shotId]: {
          ...shotData,
          voTakes
        }
      };
    });
  };

  const selectVoTake = (shotId, takeIndex) => {
    setUploadedOptions(prev => {
      const shotData = prev[shotId] || {};
      const voTakes = (shotData.voTakes || []).map((take, i) => ({
        ...take,
        selected: i === takeIndex
      }));
      return {
        ...prev,
        [shotId]: {
          ...shotData,
          voTakes
        }
      };
    });
  };

  const removeVoTake = (shotId, takeIndex) => {
    setUploadedOptions(prev => {
      const shotData = prev[shotId] || {};
      const voTakes = (shotData.voTakes || []).filter((_, i) => i !== takeIndex);
      return {
        ...prev,
        [shotId]: {
          ...shotData,
          voTakes
        }
      };
    });
  };

  const getVoTimingStatus = (actualDuration, targetDuration) => {
    if (!actualDuration || !targetDuration) return null;
    const actual = parseFloat(actualDuration);
    const target = parseFloat(targetDuration);
    const diff = Math.abs(actual - target);
    const pct = diff / target;
    
    if (pct <= 0.15) return { status: 'good', color: '#4ade80', label: 'Good' };
    if (pct <= 0.3) return { status: 'warn', color: '#fbbf24', label: `${actual > target ? '+' : '-'}${diff.toFixed(1)}s` };
    return { status: 'bad', color: '#f87171', label: `${actual > target ? '+' : '-'}${diff.toFixed(1)}s` };
  };

  // Auto-select the first VO take that fits within the clip duration
  const autoSelectVoTake = (shotId, selectedOptionNum) => {
    const options = uploadedOptions[shotId];
    if (!options) return;
    
    const voTakes = options.voTakes || [];
    if (voTakes.length === 0) return;
    
    // Get the selected video's duration
    const selectedVideo = options[selectedOptionNum];
    const clipDuration = selectedVideo?.duration ? parseFloat(selectedVideo.duration) : null;
    
    if (!clipDuration) {
      // No clip duration, just select first take
      selectVoTake(shotId, 0);
      return;
    }
    
    // Find first take that fits (duration <= clip duration)
    const fittingTakeIndex = voTakes.findIndex(take => {
      const takeDuration = take.duration ? parseFloat(take.duration) : 0;
      return takeDuration <= clipDuration;
    });
    
    if (fittingTakeIndex >= 0) {
      selectVoTake(shotId, fittingTakeIndex);
    } else {
      // No takes fit, select the shortest one
      let shortestIndex = 0;
      let shortestDuration = Infinity;
      voTakes.forEach((take, idx) => {
        const dur = take.duration ? parseFloat(take.duration) : Infinity;
        if (dur < shortestDuration) {
          shortestDuration = dur;
          shortestIndex = idx;
        }
      });
      selectVoTake(shotId, shortestIndex);
    }
  };

  const saveElevenLabsKey = async (key) => {
    setElevenLabsKey(key);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elevenLabsKey: key })
      });
    } catch (err) {
      console.error('Failed to save API key:', err);
    }
  };

  const saveClaudeKey = async (key) => {
    setClaudeKey(key);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claudeKey: key })
      });
    } catch (err) {
      console.error('Failed to save Claude API key:', err);
    }
  };

  const saveVeoKey = async (path) => {
    setVeoKey(path);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ veoServiceAccountPath: path })
      });
    } catch (err) {
      console.error('Failed to save Veo service account path:', err);
    }
  };

  const saveVeoApiKey = async (key) => {
    setVeoApiKey(key);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ veoApiKey: key })
      });
    } catch (err) {
      console.error('Failed to save Veo API key:', err);
    }
  };

  const generateVeoClip = async (shotId, prompt, duration, referenceImageBase64 = null) => {
    if (!veoKey) {
      alert('Please configure Veo API key in Settings.');
      setShowSettings(true);
      return;
    }

    setVeoGenerating(prev => ({ ...prev, [shotId]: true }));
    setVeoStatus(prev => ({ ...prev, [shotId]: referenceImageBase64 ? 'Starting generation with reference image...' : 'Starting generation...' }));

    try {
      // Start generation
      const response = await fetch('/api/veo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          aspectRatio: project.aspect_ratio || '9:16',
          durationSeconds: Math.min(duration, 8), // Veo max is 8 seconds per clip
          referenceImageBase64
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Vertex AI returns full operation path like: 
      // projects/{project}/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/{id}
      const operationName = data.name;
      if (!operationName) {
        throw new Error('No operation name returned');
      }
      
      console.log('Operation started:', operationName);

      setVeoStatus(prev => ({ ...prev, [shotId]: 'Processing...' }));

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
        // POST the operation name for status check
        const statusResponse = await fetch('/api/veo/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationName })
        });
        
        if (!statusResponse.ok) {
          const errorData = await statusResponse.json();
          console.error('Status check error:', errorData);
          attempts++;
          continue;
        }
        
        const statusData = await statusResponse.json();
        console.log('Status:', statusData);

        if (statusData.done) {
          if (statusData.error) {
            throw new Error(statusData.error.message || 'Generation failed');
          }

          // Get the video from response - structure may vary
          const videos = statusData.response?.videos || 
                        statusData.response?.generatedVideos ||
                        statusData.response?.predictions;
          
          if (!videos || videos.length === 0) {
            console.log('Full response:', JSON.stringify(statusData, null, 2));
            throw new Error('No video in response');
          }

          const videoData = videos[0];
          const filename = `${project.project_id}_${shotId}_${Date.now()}.mp4`;
          
          setVeoStatus(prev => ({ ...prev, [shotId]: 'Saving...' }));

          let downloadData;
          
          // Check if we have base64 encoded video or a URI
          if (videoData.bytesBase64Encoded) {
            // Video is base64 encoded in response - send to server to save
            const saveResponse = await fetch('/api/veo/save-base64', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                base64Data: videoData.bytesBase64Encoded,
                filename
              })
            });

            if (!saveResponse.ok) {
              const errorData = await saveResponse.json();
              throw new Error(errorData.error || 'Failed to save video');
            }

            downloadData = await saveResponse.json();
          } else {
            // Video is at a URI - download it
            const videoUri = videoData.uri || videoData.video?.uri || videoData.gcsUri;
            
            if (!videoUri) {
              console.log('Video data:', JSON.stringify(videoData, null, 2));
              throw new Error('No video URI or base64 data in response');
            }

            const downloadResponse = await fetch('/api/veo/download', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoUri,
                filename
              })
            });

            if (!downloadResponse.ok) {
              const errorData = await downloadResponse.json();
              throw new Error(errorData.error || 'Download failed');
            }

            downloadData = await downloadResponse.json();
          }

          // Add to shot options
          setUploadedOptions(prev => {
            const shotData = prev[shotId] || {};
            const optionNum = shotData[1]?.videoPath ? 2 : 1;
            return {
              ...prev,
              [shotId]: {
                ...shotData,
                [optionNum]: {
                  ...shotData[optionNum],
                  videoPath: downloadData.path,
                  videoFilename: downloadData.filename,
                  duration: downloadData.duration,
                  generatedAt: new Date().toISOString()
                }
              }
            };
          });

          setVeoStatus(prev => ({ ...prev, [shotId]: 'Complete!' }));
          setTimeout(() => {
            setVeoStatus(prev => ({ ...prev, [shotId]: null }));
          }, 3000);
          
          break;
        }

        // Update status with progress if available
        const metadata = statusData.metadata;
        if (metadata) {
          const progress = metadata.progressPercent || metadata['@type']?.includes('progress');
          if (progress) {
            setVeoStatus(prev => ({ ...prev, [shotId]: `Processing... ${typeof progress === 'number' ? progress + '%' : ''}` }));
          }
        }

        attempts++;
      }

      if (attempts >= maxAttempts) {
        throw new Error('Generation timed out after 5 minutes');
      }

    } catch (err) {
      console.error('Veo generation error:', err);
      setVeoStatus(prev => ({ ...prev, [shotId]: `Error: ${err.message}` }));
    }

    setVeoGenerating(prev => ({ ...prev, [shotId]: false }));
  };

  const fetchElevenLabsVoices = async () => {
    if (!elevenLabsKey) {
      alert('Please enter your API key first.');
      return;
    }
    try {
      console.log('Fetching voices...');
      const response = await fetch('/api/elevenlabs/voices');
      console.log('Response status:', response.status);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed: ${response.status}`);
      }
      const data = await response.json();
      console.log('Voices data:', data);
      setElevenLabsVoices(data.voices || []);
      if (data.voices?.length === 0) {
        alert('No voices found in your account.');
      }
    } catch (err) {
      console.error('Failed to fetch voices:', err);
      alert('Failed to fetch voices: ' + err.message);
    }
  };

  const saveSelectedVoice = async (voiceId) => {
    setSelectedVoice(voiceId);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedVoice: voiceId })
      });
    } catch (err) {
      console.error('Failed to save voice selection:', err);
    }
  };

  const generateVoTake = async (shotId, voText) => {
    if (!elevenLabsKey || !selectedVoice) {
      alert('Please configure ElevenLabs API key and select a voice in Settings.');
      setShowSettings(true);
      return;
    }

    setVoGenerating(true);
    
    try {
      const response = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId: selectedVoice,
          text: voText,
          voiceSettings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();
      const audioUrl = data.path;
      
      // Get duration by loading into audio element
      const audio = new Audio(audioUrl);
      await new Promise((resolve, reject) => {
        audio.onloadedmetadata = resolve;
        audio.onerror = reject;
      });
      const duration = audio.duration.toFixed(2);

      // Add the take
      setUploadedOptions(prev => {
        const shotData = prev[shotId] || {};
        const voTakes = shotData.voTakes || [];
        return {
          ...prev,
          [shotId]: {
            ...shotData,
            voTakes: [...voTakes, { 
              duration, 
              notes: '', 
              selected: false,
              audioUrl,
              filename: data.filename,
              generatedAt: new Date().toISOString()
            }]
          }
        };
      });

    } catch (err) {
      console.error('VO generation error:', err);
      alert('Failed to generate VO: ' + err.message);
    }
    
    setVoGenerating(false);
  };

  const runAIReview = async (shotId) => {
    const options = uploadedOptions[shotId];
    if (!options) {
      alert('No options available for review');
      return;
    }
    
    // Check what we have to work with
    const opt1 = options[1];
    const opt2 = options[2];
    
    const hasOpt1 = opt1?.videoPath || opt1?.dataUrl;
    const hasOpt2 = opt2?.videoPath || opt2?.dataUrl;
    
    if (!hasOpt1 && !hasOpt2) {
      alert('Please generate or upload at least one option first');
      return;
    }

    setAiReviewLoading(prev => ({ ...prev, [shotId]: true }));
    setAiReviewResult(prev => ({ ...prev, [shotId]: null }));

    const shot = project.shots.find(s => s.shot_id === shotId);
    
    // Build description for each option
    const buildOptionContext = (opt, num) => {
      if (!opt) return `Option ${num}: Not available`;
      
      let context = `Option ${num}:`;
      if (opt.duration) context += `\n  Duration: ${parseFloat(opt.duration).toFixed(2)}s`;
      if (opt.audioDescription) context += `\n  AI Analysis:\n${opt.audioDescription}`;
      else context += `\n  No AI analysis available`;
      return context;
    };
    
    const opt1Context = buildOptionContext(opt1, 1);
    const opt2Context = buildOptionContext(opt2, 2);
    
    // Check if we have videos to extract frames from
    const hasVideos = opt1?.videoPath || opt2?.videoPath;
    const hasUploadedImages = opt1?.dataUrl || opt2?.dataUrl;

    const prompt = `You are reviewing generated video options for a short film called "${project.title}".

Concept: ${project.concept}

This is ${shotId} with the following prompt:
"${shot.veo_prompt}"

${shot.vo ? `VO for this shot: "${shot.vo.text}" (${shot.vo.timing}, ${shot.vo.target_seconds}s)` : 'No VO for this shot.'}

Target duration: ${shot.duration_target}s

VIDEO OPTIONS:
${opt1Context}

${opt2Context}

${hasVideos || hasUploadedImages ? 'You are being shown the first frame from each available option.' : 'No frames available - evaluate based on the AI analysis descriptions above.'}

Select the option that best serves the piece. Consider:
- How well it matches the original prompt intent
- Audio/sound design (note any issues mentioned in the analysis)
- Duration fit with target
- Any discrepancies noted between prompt and result
- Technical quality issues

${!hasOpt1 ? 'Note: Option 1 is not available, so select Option 2 if it works, or recommend retry.' : ''}
${!hasOpt2 ? 'Note: Option 2 is not available, so select Option 1 if it works, or recommend retry.' : ''}

Respond with JSON only:
{
  "selection": 1 or 2,
  "reasoning": "brief explanation",
  "retry": false,
  "retry_prompt_adjustment": null
}

If the available option(s) don't work well, set retry to true and provide retry_prompt_adjustment with suggested prompt changes.`;

    try {
      const messageContent = [];
      
      // Helper to get frame - either from uploaded dataUrl or extract from video
      const getFrame = async (opt) => {
        if (!opt) return null;
        if (opt.dataUrl) return opt.dataUrl;
        if (opt.videoPath) {
          try {
            const response = await fetch('/api/extract-frame', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ videoPath: opt.videoPath, timestamp: 0 })
            });
            if (response.ok) {
              const data = await response.json();
              return data.dataUrl;
            }
          } catch (err) {
            console.error('Frame extraction failed:', err);
          }
        }
        return null;
      };
      
      // Extract frames from videos if needed
      const [frame1, frame2] = await Promise.all([
        getFrame(opt1),
        getFrame(opt2)
      ]);
      
      // Add images if available
      if (frame1) {
        messageContent.push({ 
          type: 'image', 
          source: { type: 'base64', media_type: 'image/jpeg', data: frame1.split(',')[1] }
        });
      }
      if (frame2) {
        messageContent.push({ 
          type: 'image', 
          source: { type: 'base64', media_type: 'image/jpeg', data: frame2.split(',')[1] }
        });
      }
      
      // Add the text prompt
      messageContent.push({ type: 'text', text: prompt });
      
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: messageContent
          }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.content.map(c => c.text || '').join('');
      const cleaned = text.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cleaned);
      
      setAiReviewResult(prev => ({ ...prev, [shotId]: result }));
      
      if (result.retry) {
        // Flag for human review - don't auto-select
        updateShotStatus(shotId, 'needs_human_review');
      } else if (result.selection === 1 || result.selection === 2) {
        // Auto-select the chosen option for assembly
        setSelectedForAssembly(prev => ({ ...prev, [shotId]: result.selection }));
        updateShotStatus(shotId, 'selected', result.selection);
        
        // Auto-select VO take if shot has VO
        autoSelectVoTake(shotId, result.selection);
      }
    } catch (err) {
      console.error('AI Review error:', err);
      setAiReviewResult(prev => ({ ...prev, [shotId]: { error: err.message } }));
    }
    
    setAiReviewLoading(prev => ({ ...prev, [shotId]: false }));
  };

  const generateAssemblyInstructions = () => {
    const timeline = [];
    let currentTime = 0;

    project.shots.forEach(shot => {
      if (shot.status === 'selected' || shot.status === 'best_available') {
        const entry = {
          asset: `${shot.shot_id}_option${shot.selected_option}`,
          start: currentTime,
          duration: shot.duration_target,
          trim_in: 0
        };
        
        if (shot.vo) {
          entry.vo = {
            text: shot.vo.text,
            timing: shot.vo.timing,
            target_seconds: shot.vo.target_seconds
          };
        }
        
        timeline.push(entry);
        currentTime += shot.duration_target;
      }
    });

    // Add black gap and title card
    timeline.push({
      asset: 'black',
      start: currentTime,
      duration: 0.75
    });
    currentTime += 0.75;

    timeline.push({
      asset: 'title_card',
      start: currentTime,
      duration: project.title_card.duration,
      text: project.title_card.text
    });

    const instructions = {
      project_id: project.project_id,
      timeline,
      audio_layers: [
        {
          asset: 'hold_music',
          start: 0,
          duration: currentTime + project.title_card.duration,
          fade_out: 0,
          cut_abrupt: true
        }
      ],
      ffmpeg_hint: generateFFmpegHint(timeline)
    };

    setAssemblyInstructions(instructions);
  };

  const generateFFmpegHint = (timeline) => {
    return `# Conceptual ffmpeg assembly
# Actual commands depend on your file naming

ffmpeg -i shot_1.mp4 -i shot_2.mp4 -i shot_3.mp4 -i shot_4.mp4 -i shot_5.mp4 \\
  -i hold_music.mp3 -i vo_track.mp3 \\
  -filter_complex "[0:v][1:v][2:v][3:v][4:v]concat=n=5:v=1:a=0[outv]" \\
  -map "[outv]" -map 5:a -map 6:a \\
  -shortest output.mp4`;
  };

  const allShotsReviewed = project?.shots?.every(s => 
    s.status === 'selected' || s.status === 'best_available'
  ) || false;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#e0e0e0',
      fontFamily: '"IBM Plex Mono", monospace',
      padding: '24px'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        
        * { box-sizing: border-box; }
        
        .panel {
          background: #141414;
          border: 1px solid #2a2a2a;
          border-radius: 4px;
          padding: 20px;
          margin-bottom: 16px;
        }
        
        .status-pending { color: #666; }
        .status-selected { color: #4ade80; }
        .status-retry_needed { color: #fbbf24; }
        .status-best_available { color: #f97316; }
        .status-needs_human_review { color: #f87171; background: #f8717122; padding: 2px 6px; border-radius: 3px; }
        
        .shot-card {
          background: #1a1a1a;
          border: 1px solid #333;
          padding: 16px;
          margin: 8px 0;
          cursor: pointer;
          transition: border-color 0.2s;
        }
        .shot-card:hover {
          border-color: #4ade80;
        }
        .shot-card.active {
          border-color: #4ade80;
          background: #1f2a1f;
        }
        
        .btn {
          background: #2a2a2a;
          border: 1px solid #444;
          color: #e0e0e0;
          padding: 8px 16px;
          cursor: pointer;
          font-family: inherit;
          font-size: 13px;
          transition: all 0.2s;
        }
        .btn:hover {
          background: #3a3a3a;
          border-color: #4ade80;
        }
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-primary {
          background: #166534;
          border-color: #4ade80;
        }
        
        .option-upload {
          border: 2px dashed #333;
          padding: 20px;
          text-align: center;
          margin: 8px 0;
          cursor: pointer;
        }
        .option-upload:hover {
          border-color: #4ade80;
        }
        .option-upload.has-image {
          border-style: solid;
          border-color: #4ade80;
        }
        
        .option-image {
          max-width: 100%;
          max-height: 300px;
          object-fit: contain;
        }
        
        .prompt-box {
          background: #0d0d0d;
          border: 1px solid #222;
          padding: 12px;
          font-size: 12px;
          line-height: 1.5;
          white-space: pre-wrap;
          margin: 12px 0;
        }
        
        .code-block {
          background: #0d0d0d;
          border: 1px solid #222;
          padding: 16px;
          font-size: 11px;
          overflow-x: auto;
          white-space: pre;
        }

        .header {
          border-bottom: 1px solid #2a2a2a;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }

        .grid {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 24px;
        }

        .label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #666;
          margin-bottom: 4px;
        }
      `}</style>

      <div className="header">
        <div style={{ fontSize: '10px', color: '#4ade80', letterSpacing: '2px', marginBottom: '8px' }}>
          VIDEO PIPELINE CONTROL v0.3
        </div>
        {project ? (
          <>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 500 }}>
              {project.title}
            </h1>
            <div style={{ color: '#888', marginTop: '8px' }}>
              {project.concept}
            </div>
          </>
        ) : (
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 500 }}>
            No Active Project
          </h1>
        )}
      </div>

      {!project ? (
        <div className="panel" style={{ maxWidth: '600px' }}>
          <div className="label">Generate New Project</div>
          <p style={{ color: '#888', fontSize: '13px', marginTop: '8px' }}>
            Describe what you want, or leave blank for dealer's choice.
          </p>
          <textarea
            placeholder="e.g., 'Something about the loneliness of late-night diners' or 'A meditation on planned obsolescence' or just leave empty..."
            value={generatorBrief}
            onChange={(e) => setGeneratorBrief(e.target.value)}
            rows={4}
            style={{
              width: '100%',
              background: '#0d0d0d',
              border: '1px solid #333',
              color: '#e0e0e0',
              padding: '12px',
              fontFamily: 'inherit',
              fontSize: '13px',
              resize: 'vertical',
              marginTop: '12px'
            }}
          />
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button
              className="btn btn-primary"
              onClick={generateNewProject}
              disabled={generatorLoading}
              style={{ flex: 1 }}
            >
              {generatorLoading ? 'Generating...' : "Dealer's Choice"}
            </button>
            <button
              className="btn"
              onClick={() => setProject(HOLD_MUSIC_PROJECT)}
              style={{ flex: 1 }}
            >
              Load Demo Project
            </button>
          </div>
        </div>
      ) : (
      <div className="grid">
        <div>
          <div className="panel">
            <div className="label">Shots</div>
            {project.shots.map(shot => (
              <div
                key={shot.shot_id}
                className={`shot-card ${activeShot === shot.shot_id ? 'active' : ''}`}
                onClick={() => setActiveShot(shot.shot_id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500 }}>{shot.shot_id.toUpperCase()}</span>
                  <span className={`status-${shot.status}`} style={{ fontSize: '11px' }}>
                    {shot.status.toUpperCase()}
                    {shot.retries > 0 && ` (${shot.retries}/${MAX_RETRIES})`}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                  {shot.duration_target}s • {shot.vo ? `VO: "${shot.vo.text.slice(0, 30)}..."` : 'No VO'}
                </div>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="label">Pipeline Status</div>
            <div style={{ fontSize: '13px', marginTop: '8px' }}>
              <div>Reviewed: {project.shots.filter(s => s.status !== 'pending').length}/{project.shots.length}</div>
              <div>Retries used: {project.shots.reduce((a, s) => a + s.retries, 0)}</div>
              <div style={{ color: '#666', marginTop: '4px' }}>
                Storage: {storageStatus === 'loading' ? 'loading...' : storageStatus === 'loaded' ? '✓ restored' : 'new session'}
              </div>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '16px' }}
              disabled={!allShotsReviewed}
              onClick={generateAssemblyInstructions}
            >
              Generate Assembly Instructions
            </button>
            {!confirmReset ? (
              <button
                className="btn"
                style={{ width: '100%', marginTop: '8px' }}
                onClick={() => setConfirmReset(true)}
              >
                Reset Project
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  className="btn"
                  style={{ flex: 1, background: '#7f1d1d', borderColor: '#f87171' }}
                  onClick={resetProject}
                >
                  Confirm Reset
                </button>
                <button
                  className="btn"
                  style={{ flex: 1 }}
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </button>
              </div>
            )}
            <button
              className="btn"
              style={{ width: '100%', marginTop: '8px' }}
              onClick={() => setShowPromptExport(true)}
            >
              Export Prompts
            </button>
            <button
              className="btn"
              style={{ width: '100%', marginTop: '8px' }}
              onClick={() => setShowSettings(true)}
            >
              Settings
            </button>
          </div>
        </div>

        <div>
          {activeShot ? (
            <div className="panel">
              {(() => {
                const shot = project.shots.find(s => s.shot_id === activeShot);
                const options = uploadedOptions[activeShot] || {};
                
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div>
                        <div className="label">Active Shot</div>
                        <h2 style={{ margin: '4px 0 0 0', fontSize: '18px' }}>{shot.shot_id.toUpperCase()}</h2>
                      </div>
                      <span className={`status-${shot.status}`} style={{ fontSize: '12px' }}>
                        {shot.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="label" style={{ marginTop: '20px' }}>Veo Prompt</div>
                    <div className="prompt-box">{shot.veo_prompt}</div>

                    {shot.vo && (
                      <>
                        <div className="label">VO</div>
                        <div className="prompt-box">
                          "{shot.vo.text}"
                          {'\n'}Timing: {shot.vo.timing} • Target: {shot.vo.target_seconds}s
                        </div>

                        <div className="label" style={{ marginTop: '16px' }}>VO Takes</div>
                        <div style={{ marginTop: '8px' }}>
                          {(options.voTakes || []).map((take, index) => {
                            const timing = getVoTimingStatus(take.duration, shot.vo.target_seconds);
                            return (
                              <div 
                                key={index} 
                                style={{ 
                                  background: take.selected ? '#1f2a1f' : '#1a1a1a',
                                  border: `1px solid ${take.selected ? '#4ade80' : '#333'}`,
                                  padding: '12px',
                                  marginBottom: '8px',
                                  borderRadius: '4px'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 500 }}>Take {index + 1}</span>
                                  {timing && (
                                    <span style={{ 
                                      fontSize: '11px', 
                                      color: timing.color,
                                      background: `${timing.color}22`,
                                      padding: '2px 6px',
                                      borderRadius: '3px'
                                    }}>
                                      {timing.label}
                                    </span>
                                  )}
                                  {take.selected && (
                                    <span style={{ 
                                      fontSize: '11px', 
                                      color: '#4ade80',
                                      marginLeft: 'auto'
                                    }}>
                                      ✓ Selected
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                  <input
                                    type="text"
                                    placeholder="Duration (s)"
                                    value={take.duration}
                                    onChange={(e) => updateVoTake(activeShot, index, 'duration', e.target.value)}
                                    style={{
                                      width: '100px',
                                      background: '#0d0d0d',
                                      border: '1px solid #333',
                                      color: '#e0e0e0',
                                      padding: '6px 8px',
                                      fontFamily: 'inherit',
                                      fontSize: '12px'
                                    }}
                                  />
                                  <input
                                    type="text"
                                    placeholder="Notes (optional)"
                                    value={take.notes}
                                    onChange={(e) => updateVoTake(activeShot, index, 'notes', e.target.value)}
                                    style={{
                                      flex: 1,
                                      background: '#0d0d0d',
                                      border: '1px solid #333',
                                      color: '#e0e0e0',
                                      padding: '6px 8px',
                                      fontFamily: 'inherit',
                                      fontSize: '12px'
                                    }}
                                  />
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  {take.audioUrl && (
                                    <button
                                      className="btn"
                                      style={{ padding: '4px 8px', fontSize: '11px' }}
                                      onClick={() => new Audio(take.audioUrl).play()}
                                    >
                                      ▶ Play
                                    </button>
                                  )}
                                  <button
                                    className="btn"
                                    style={{ padding: '4px 8px', fontSize: '11px' }}
                                    onClick={() => selectVoTake(activeShot, index)}
                                    disabled={take.selected}
                                  >
                                    {take.selected ? 'Selected' : 'Select'}
                                  </button>
                                  <button
                                    className="btn"
                                    style={{ padding: '4px 8px', fontSize: '11px' }}
                                    onClick={() => removeVoTake(activeShot, index)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          <button
                            className="btn"
                            style={{ width: '100%', marginTop: '4px' }}
                            onClick={() => addVoTake(activeShot)}
                          >
                            + Add Take Manually
                          </button>
                          <button
                            className="btn btn-primary"
                            style={{ width: '100%', marginTop: '8px' }}
                            onClick={() => generateVoTake(activeShot, shot.vo.text)}
                            disabled={voGenerating}
                          >
                            {voGenerating ? 'Generating...' : '🎙 Generate VO Take'}
                          </button>
                        </div>
                      </>
                    )}

                    <div className="label" style={{ marginTop: '20px' }}>Options for Review</div>
                    
                    {/* Reference Shot Selection */}
                    <div style={{ marginBottom: '12px', marginTop: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#888' }}>Reference shot:</span>
                        <select
                          value={shot.referenceShot || ''}
                          onChange={(e) => {
                            const newShots = project.shots.map(s => 
                              s.shot_id === activeShot 
                                ? { ...s, referenceShot: e.target.value || null }
                                : s
                            );
                            setProject({ ...project, shots: newShots });
                          }}
                          style={{
                            background: '#1a1a1a',
                            border: '1px solid #333',
                            color: '#e0e0e0',
                            padding: '4px 8px',
                            fontSize: '12px',
                            borderRadius: '4px'
                          }}
                        >
                          <option value="">None</option>
                          {project.shots
                            .filter(s => s.shot_id !== activeShot)
                            .map(s => {
                              const hasSelected = selectedForAssembly[s.shot_id];
                              return (
                                <option 
                                  key={s.shot_id} 
                                  value={s.shot_id}
                                  disabled={!hasSelected}
                                >
                                  {s.shot_id} {hasSelected ? '✓' : '(no selection)'}
                                </option>
                              );
                            })
                          }
                        </select>
                        {shot.referenceShot && (
                          <span style={{ fontSize: '11px', color: '#60a5fa' }}>
                            Will use first frame from {shot.referenceShot}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Veo Generation */}
                    <div style={{ marginBottom: '16px' }}>
                      {shot.referenceShot && !selectedForAssembly[shot.referenceShot] && (
                        <div style={{ 
                          fontSize: '11px', 
                          color: '#fbbf24', 
                          marginBottom: '8px',
                          padding: '6px 10px',
                          background: '#fbbf2422',
                          borderRadius: '4px'
                        }}>
                          ⚠ Select a video option for <strong>{shot.referenceShot}</strong> first to use as reference
                        </div>
                      )}
                      <button
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        onClick={async () => {
                          let refImage = null;
                          
                          // Get reference frame if specified
                          if (shot.referenceShot) {
                            const refShotOptions = uploadedOptions[shot.referenceShot];
                            const refSelectedOption = selectedForAssembly[shot.referenceShot];
                            const refVideoPath = refShotOptions?.[refSelectedOption]?.videoPath;
                            
                            if (!refVideoPath) {
                              alert(`Please select a video option for ${shot.referenceShot} first.`);
                              return;
                            }
                            
                            try {
                              setVeoStatus(prev => ({ ...prev, [activeShot]: 'Extracting reference frame...' }));
                              const frameRes = await fetch('/api/extract-frame', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ videoPath: refVideoPath, timestamp: 0 })
                              });
                              if (frameRes.ok) {
                                const frameData = await frameRes.json();
                                refImage = frameData.dataUrl.split(',')[1]; // Remove data:image/jpeg;base64, prefix
                              }
                            } catch (err) {
                              console.error('Failed to extract reference frame:', err);
                            }
                          }
                          
                          generateVeoClip(activeShot, shot.veo_prompt, shot.duration_target, refImage);
                        }}
                        disabled={veoGenerating[activeShot] || (shot.referenceShot && !selectedForAssembly[shot.referenceShot])}
                      >
                        {veoGenerating[activeShot] ? '🎬 Generating...' : shot.referenceShot ? '🎬 Generate with Veo (using reference)' : '🎬 Generate with Veo'}
                      </button>
                      {veoStatus[activeShot] && (
                        <div style={{ 
                          fontSize: '12px', 
                          color: veoStatus[activeShot].startsWith('Error') ? '#f87171' : '#4ade80',
                          marginTop: '8px',
                          textAlign: 'center'
                        }}>
                          {veoStatus[activeShot]}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '8px' }}>
                      {[1, 2].map(num => (
                        <div key={num}>
                          <div style={{ fontSize: '12px', marginBottom: '8px' }}>Option {num}</div>
                          
                          {/* Video preview if generated */}
                          {options[num]?.videoPath && (
                            <div style={{ 
                              marginBottom: '8px',
                              border: selectedForAssembly[activeShot] === num ? '2px solid #4ade80' : '2px solid transparent',
                              borderRadius: '6px',
                              padding: '4px'
                            }}>
                              <video 
                                src={options[num].videoPath} 
                                controls 
                                style={{ width: '100%', borderRadius: '4px' }}
                              />
                              <div style={{ fontSize: '10px', color: '#666', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>
                                  {options[num].videoFilename}
                                  {options[num].duration && (
                                    <span style={{ marginLeft: '8px', color: '#888' }}>
                                      ({parseFloat(options[num].duration).toFixed(2)}s)
                                    </span>
                                  )}
                                </span>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button
                                    onClick={() => handleSelectForAssembly(activeShot, num)}
                                    style={{
                                      background: selectedForAssembly[activeShot] === num ? '#4ade80' : '#2a2a2a',
                                      border: '1px solid #444',
                                      color: selectedForAssembly[activeShot] === num ? '#000' : '#e0e0e0',
                                      padding: '2px 8px',
                                      fontSize: '10px',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontWeight: selectedForAssembly[activeShot] === num ? 'bold' : 'normal'
                                    }}
                                  >
                                    {selectedForAssembly[activeShot] === num ? '✓ Selected' : 'Select'}
                                  </button>
                                  <button
                                    onClick={() => handleDescribeVideo(activeShot, num)}
                                    disabled={describingVideo[`${activeShot}-${num}`]}
                                    style={{
                                      background: '#2a2a2a',
                                      border: '1px solid #444',
                                      color: '#e0e0e0',
                                      padding: '2px 8px',
                                      fontSize: '10px',
                                      borderRadius: '4px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {describingVideo[`${activeShot}-${num}`] ? '...' : 'Describe'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Image upload for frame */}
                          <label className={`option-upload ${options[num]?.dataUrl ? 'has-image' : ''}`}>
                            {options[num]?.dataUrl ? (
                              <img src={options[num].dataUrl} alt={`Option ${num}`} className="option-image" />
                            ) : (
                              <div style={{ color: '#666' }}>Click to upload frame</div>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => handleImageUpload(activeShot, num, e)}
                            />
                          </label>
                          <div style={{ marginTop: '8px' }}>
                            <input
                              type="text"
                              placeholder="Duration (seconds)"
                              value={options[num]?.duration || ''}
                              onChange={(e) => handleAudioDescription(activeShot, num, 'duration', e.target.value)}
                              style={{
                                width: '100%',
                                background: '#0d0d0d',
                                border: '1px solid #333',
                                color: '#e0e0e0',
                                padding: '8px',
                                fontFamily: 'inherit',
                                fontSize: '12px',
                                marginBottom: '4px'
                              }}
                            />
                            <textarea
                              placeholder="Audio description (sounds, music, any issues)"
                              value={options[num]?.audioDescription || ''}
                              onChange={(e) => handleAudioDescription(activeShot, num, 'audioDescription', e.target.value)}
                              rows={2}
                              style={{
                                width: '100%',
                                background: '#0d0d0d',
                                border: '1px solid #333',
                                color: '#e0e0e0',
                                padding: '8px',
                                fontFamily: 'inherit',
                                fontSize: '12px',
                                resize: 'vertical'
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                      <button
                        className="btn btn-primary"
                        disabled={(!options[1]?.videoPath && !options[1]?.dataUrl && !options[2]?.videoPath && !options[2]?.dataUrl) || aiReviewLoading[activeShot]}
                        onClick={() => runAIReview(activeShot)}
                      >
                        {aiReviewLoading[activeShot] ? 'Reviewing...' : 'Run AI Review'}
                      </button>
                      <button
                        className="btn"
                        onClick={() => updateShotStatus(activeShot, 'selected', 1)}
                        disabled={!options[1]}
                      >
                        Select Option 1
                      </button>
                      <button
                        className="btn"
                        onClick={() => updateShotStatus(activeShot, 'selected', 2)}
                        disabled={!options[2]}
                      >
                        Select Option 2
                      </button>
                    </div>

                    {aiReviewResult[activeShot] && (
                      <div style={{ marginTop: '20px' }}>
                        <div className="label">AI Review Result</div>
                        <div className="prompt-box" style={{
                          borderLeft: aiReviewResult[activeShot].retry 
                            ? '3px solid #f87171' 
                            : aiReviewResult[activeShot].error 
                              ? '3px solid #f87171'
                              : '3px solid #4ade80'
                        }}>
                          {aiReviewResult[activeShot].error ? (
                            <span style={{ color: '#f87171' }}>Error: {aiReviewResult[activeShot].error}</span>
                          ) : aiReviewResult[activeShot].retry ? (
                            <>
                              <div style={{ 
                                background: '#f8717133', 
                                padding: '8px 12px', 
                                borderRadius: '4px',
                                marginBottom: '12px',
                                color: '#f87171',
                                fontWeight: 'bold'
                              }}>
                                ⚠ NEEDS HUMAN REVIEW
                              </div>
                              <div style={{ marginBottom: '8px' }}>{aiReviewResult[activeShot].reasoning}</div>
                              <div style={{ color: '#fbbf24' }}>
                                <strong>Suggested adjustment:</strong> {aiReviewResult[activeShot].retry_prompt_adjustment}
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ 
                                background: '#4ade8033', 
                                padding: '8px 12px', 
                                borderRadius: '4px',
                                marginBottom: '12px',
                                color: '#4ade80',
                                fontWeight: 'bold'
                              }}>
                                ✓ Selected Option {aiReviewResult[activeShot].selection}
                              </div>
                              <div>{aiReviewResult[activeShot].reasoning}</div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="panel" style={{ color: '#666', textAlign: 'center', padding: '60px 20px' }}>
              Select a shot to review
            </div>
          )}

          {/* Assembly Panel */}
          {project?.shots && (
            <div className="panel" style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div className="label">Assembly</div>
                <button
                  onClick={handleAssemble}
                  disabled={assembling || Object.keys(selectedForAssembly).filter(k => selectedForAssembly[k]).length === 0}
                  className="btn btn-primary"
                  style={{ padding: '6px 16px' }}
                >
                  {assembling ? 'Assembling...' : 'Assemble Video'}
                </button>
              </div>
              
              {/* Shot selection summary */}
              <div style={{ 
                background: '#0d0d0d', 
                border: '1px solid #333', 
                borderRadius: '4px', 
                padding: '12px',
                marginBottom: '12px'
              }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
                  Selected shots ({Object.keys(selectedForAssembly).filter(k => selectedForAssembly[k]).length} of {project.shots.length})
                </div>
                {project.shots.map((shot, idx) => {
                  const selectedOption = selectedForAssembly[shot.shot_id];
                  const options = uploadedOptions[shot.shot_id] || {};
                  const videoData = selectedOption ? options[selectedOption] : null;
                  const videoDuration = videoData ? parseFloat(videoData.duration) || 999 : 999;
                  
                  // Check for VO - manual or auto-fit
                  const voTakes = options.voTakes || [];
                  const manualVo = voTakes.find(t => t.selected);
                  const autoVo = !manualVo && voTakes.find(t => parseFloat(t.duration) <= videoDuration);
                  const hasVo = manualVo || autoVo;
                  
                  return (
                    <div 
                      key={shot.shot_id}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        padding: '4px 0',
                        borderBottom: idx < project.shots.length - 1 ? '1px solid #222' : 'none'
                      }}
                    >
                      <span style={{ 
                        width: '24px', 
                        height: '24px', 
                        background: selectedOption ? '#4ade80' : '#333',
                        color: selectedOption ? '#000' : '#666',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}>
                        {idx + 1}
                      </span>
                      <span style={{ flex: 1, fontSize: '12px', color: selectedOption ? '#e0e0e0' : '#666' }}>
                        {shot.shot_id}
                      </span>
                      {videoData ? (
                        <span style={{ fontSize: '10px', color: '#888' }}>
                          Option {selectedOption} • {videoData.duration ? parseFloat(videoData.duration).toFixed(1) : '?'}s
                          {hasVo && (
                            <span style={{ color: '#60a5fa', marginLeft: '4px' }}>
                              + VO{autoVo ? ' (auto)' : ''}
                            </span>
                          )}
                          {shot.vo && voTakes.length > 0 && !hasVo && (
                            <span style={{ color: '#f87171', marginLeft: '4px' }}>⚠ VO too long</span>
                          )}
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#666' }}>
                          Not selected
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Assembly result */}
              {assemblyResult && (
                <div style={{ 
                  background: '#1a2a1a', 
                  border: '1px solid #4ade80', 
                  borderRadius: '4px', 
                  padding: '12px'
                }}>
                  <div style={{ fontSize: '12px', color: '#4ade80', marginBottom: '8px' }}>
                    ✓ Assembly Complete
                  </div>
                  <video 
                    src={assemblyResult.path} 
                    controls 
                    style={{ width: '100%', maxHeight: '300px', borderRadius: '4px', marginBottom: '8px' }}
                  />
                  <div style={{ fontSize: '11px', color: '#888' }}>
                    {assemblyResult.filename} • {assemblyResult.duration?.toFixed(2)}s • {assemblyResult.shotCount} shots
                  </div>
                  <a 
                    href={assemblyResult.path} 
                    download={assemblyResult.filename}
                    style={{
                      display: 'inline-block',
                      marginTop: '8px',
                      padding: '6px 12px',
                      background: '#4ade80',
                      color: '#000',
                      borderRadius: '4px',
                      textDecoration: 'none',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}
                  >
                    Download
                  </a>
                </div>
              )}
              
              {/* YouTube Metadata */}
              {project && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div className="label">YouTube Metadata</div>
                    <button
                      onClick={generateYoutubeMetadata}
                      disabled={youtubeMetadataLoading}
                      className="btn"
                      style={{ padding: '4px 12px', fontSize: '12px' }}
                    >
                      {youtubeMetadataLoading ? 'Generating...' : youtubeMetadata ? 'Regenerate' : 'Generate'}
                    </button>
                  </div>
                  
                  {youtubeMetadata && (
                    <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '4px', padding: '12px' }}>
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Title</div>
                        <div style={{ 
                          background: '#0d0d0d', 
                          padding: '8px', 
                          borderRadius: '4px',
                          fontSize: '14px',
                          fontWeight: 'bold'
                        }}>
                          {youtubeMetadata.title}
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(youtubeMetadata.title)}
                          style={{
                            marginTop: '4px',
                            background: 'transparent',
                            border: '1px solid #444',
                            color: '#888',
                            padding: '2px 8px',
                            fontSize: '10px',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                        >
                          Copy
                        </button>
                      </div>
                      
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Description</div>
                        <div style={{ 
                          background: '#0d0d0d', 
                          padding: '8px', 
                          borderRadius: '4px',
                          fontSize: '12px',
                          whiteSpace: 'pre-wrap',
                          lineHeight: '1.5'
                        }}>
                          {youtubeMetadata.description}
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(youtubeMetadata.description)}
                          style={{
                            marginTop: '4px',
                            background: 'transparent',
                            border: '1px solid #444',
                            color: '#888',
                            padding: '2px 8px',
                            fontSize: '10px',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                        >
                          Copy
                        </button>
                      </div>
                      
                      <div>
                        <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Tags</div>
                        <div style={{ 
                          background: '#0d0d0d', 
                          padding: '8px', 
                          borderRadius: '4px',
                          fontSize: '11px',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '4px'
                        }}>
                          {youtubeMetadata.tags.map((tag, i) => (
                            <span key={i} style={{
                              background: '#2a2a2a',
                              padding: '2px 8px',
                              borderRadius: '3px',
                              color: '#60a5fa'
                            }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(youtubeMetadata.tags.join(', '))}
                          style={{
                            marginTop: '4px',
                            background: 'transparent',
                            border: '1px solid #444',
                            color: '#888',
                            padding: '2px 8px',
                            fontSize: '10px',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                        >
                          Copy Tags
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {showPromptExport && project && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#141414',
            border: '1px solid #2a2a2a',
            borderRadius: '4px',
            maxWidth: '800px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <div className="label">Prompt Export</div>
                <h2 style={{ margin: '4px 0 0 0', fontSize: '18px' }}>{project.title}</h2>
              </div>
              <button
                className="btn"
                onClick={() => setShowPromptExport(false)}
              >
                Close
              </button>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div className="label">Music Direction</div>
              <div className="prompt-box" style={{ marginTop: '8px' }}>
                {project.music?.description || 'No music direction specified'}
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div className="label">VO Direction</div>
              <div className="prompt-box" style={{ marginTop: '8px' }}>
                {project.vo_direction?.voice || 'No VO direction specified'}
              </div>
            </div>

            <div className="label">Shot Prompts</div>
            {project.shots.map((shot, index) => (
              <div key={shot.shot_id} style={{ 
                background: '#1a1a1a', 
                border: '1px solid #333', 
                padding: '16px', 
                marginTop: '12px' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 500, color: '#4ade80' }}>
                    {shot.shot_id.toUpperCase()} — {shot.duration_target}s
                  </span>
                  <button
                    className="btn"
                    style={{ padding: '4px 8px', fontSize: '11px' }}
                    onClick={() => navigator.clipboard.writeText(shot.veo_prompt)}
                  >
                    Copy
                  </button>
                </div>
                <div style={{ 
                  fontSize: '13px', 
                  lineHeight: '1.6', 
                  color: '#e0e0e0',
                  marginBottom: shot.vo ? '12px' : 0
                }}>
                  {shot.veo_prompt}
                </div>
                {shot.vo && (
                  <div style={{ 
                    borderTop: '1px solid #333', 
                    paddingTop: '12px',
                    marginTop: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#888' }}>
                        VO ({shot.vo.timing}, {shot.vo.target_seconds}s)
                      </span>
                      <button
                        className="btn"
                        style={{ padding: '4px 8px', fontSize: '11px' }}
                        onClick={() => navigator.clipboard.writeText(shot.vo.text)}
                      >
                        Copy
                      </button>
                    </div>
                    <div style={{ fontSize: '13px', color: '#fbbf24' }}>
                      "{shot.vo.text}"
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div style={{ marginTop: '24px' }}>
              <div className="label">Title Card</div>
              <div style={{ 
                background: '#1a1a1a', 
                border: '1px solid #333', 
                padding: '16px', 
                marginTop: '8px' 
              }}>
                <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                  <strong>{project.title_card?.text}</strong> — {project.title_card?.duration}s
                </div>
                <div style={{ fontSize: '12px', color: '#888' }}>
                  {project.title_card?.style}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '24px' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => {
                  const allPrompts = project.shots.map((shot, i) => 
                    `=== ${shot.shot_id.toUpperCase()} (${shot.duration_target}s) ===\n${shot.veo_prompt}${shot.vo ? `\n\nVO (${shot.vo.timing}, ${shot.vo.target_seconds}s): "${shot.vo.text}"` : ''}`
                  ).join('\n\n');
                  const full = `PROJECT: ${project.title}\n${project.concept}\n\nMUSIC: ${project.music?.description || 'None'}\n\nVO DIRECTION: ${project.vo_direction?.voice || 'None'}\n\n${allPrompts}\n\n=== TITLE CARD (${project.title_card?.duration}s) ===\n${project.title_card?.text}\nStyle: ${project.title_card?.style}`;
                  navigator.clipboard.writeText(full);
                }}
              >
                Copy All Prompts
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#141414',
            border: '1px solid #2a2a2a',
            borderRadius: '4px',
            maxWidth: '500px',
            width: '100%',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <div className="label">Settings</div>
                <h2 style={{ margin: '4px 0 0 0', fontSize: '18px' }}>API Configuration</h2>
              </div>
              <button
                className="btn"
                onClick={() => setShowSettings(false)}
              >
                Close
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div className="label">Claude API Key</div>
              <input
                type="password"
                placeholder="Enter your Anthropic API key"
                value={claudeKey}
                onChange={(e) => saveClaudeKey(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0d0d0d',
                  border: '1px solid #333',
                  color: '#e0e0e0',
                  padding: '10px',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  marginTop: '8px'
                }}
              />
              <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                Required for project generation and AI review.
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div className="label">Veo Service Account (JSON file path)</div>
              <input
                type="text"
                placeholder="/path/to/service-account.json"
                value={veoKey}
                onChange={(e) => saveVeoKey(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0d0d0d',
                  border: '1px solid #333',
                  color: '#e0e0e0',
                  padding: '10px',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  marginTop: '8px'
                }}
              />
              <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                Path to your Google Cloud service account JSON key file (for generation).
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div className="label">Veo API Key (Gemini API)</div>
              <input
                type="password"
                placeholder="Enter your Gemini API key"
                value={veoApiKey}
                onChange={(e) => saveVeoApiKey(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0d0d0d',
                  border: '1px solid #333',
                  color: '#e0e0e0',
                  padding: '10px',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  marginTop: '8px'
                }}
              />
              <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                Get from aistudio.google.com - required for status polling.
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div className="label">ElevenLabs API Key</div>
              <input
                type="password"
                placeholder="Enter your API key"
                value={elevenLabsKey}
                onChange={(e) => saveElevenLabsKey(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0d0d0d',
                  border: '1px solid #333',
                  color: '#e0e0e0',
                  padding: '10px',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  marginTop: '8px'
                }}
              />
              <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                Stored locally in your browser. Never sent anywhere except ElevenLabs.
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div className="label">Voice Selection</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  className="btn"
                  onClick={fetchElevenLabsVoices}
                  disabled={!elevenLabsKey}
                >
                  Fetch Voices
                </button>
                {elevenLabsVoices.length > 0 && (
                  <select
                    value={selectedVoice}
                    onChange={(e) => saveSelectedVoice(e.target.value)}
                    style={{
                      flex: 1,
                      background: '#0d0d0d',
                      border: '1px solid #333',
                      color: '#e0e0e0',
                      padding: '8px',
                      fontFamily: 'inherit',
                      fontSize: '13px'
                    }}
                  >
                    <option value="">Select a voice...</option>
                    {elevenLabsVoices.map(voice => (
                      <option key={voice.voice_id} value={voice.voice_id}>
                        {voice.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {selectedVoice && (
                <div style={{ fontSize: '11px', color: '#4ade80', marginTop: '8px' }}>
                  ✓ Voice selected: {elevenLabsVoices.find(v => v.voice_id === selectedVoice)?.name || selectedVoice}
                </div>
              )}
            </div>

            <div style={{ 
              borderTop: '1px solid #333', 
              paddingTop: '16px',
              fontSize: '12px',
              color: '#666'
            }}>
              <strong style={{ color: '#888' }}>Status:</strong><br />
              Claude API: {claudeKey ? '✓ Configured' : '✗ Not set'}<br />
              Veo API: {veoKey ? '✓ Configured' : '✗ Not set'}<br />
              ElevenLabs API: {elevenLabsKey ? '✓ Configured' : '✗ Not set'}<br />
              Voice: {selectedVoice ? '✓ Selected' : '✗ Not selected'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Render the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(VideoPipelineControl));
