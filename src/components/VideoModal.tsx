import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Play, Pause, Volume2, VolumeX, Maximize, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface VideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string;
  videoType: "youtube" | "mp4";
  thumbnail?: string;
  title?: string;
}

const extractYouTubeId = (url: string): string => {
  if (url.includes("embed/")) return url.split("embed/")[1]?.split(/[?&]/)[0] || "";
  if (url.includes("watch?v=")) return url.split("watch?v=")[1]?.split(/[?&]/)[0] || "";
  if (url.includes("youtu.be/")) return url.split("youtu.be/")[1]?.split(/[?&]/)[0] || "";
  return "";
};

const getYouTubeThumbnail = (url: string): string => {
  const id = extractYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : "";
};

const getEmbedUrl = (url: string): string => {
  const id = extractYouTubeId(url);
  if (!id) return url;
  return `https://www.youtube.com/embed/${id}?autoplay=1&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&enablejsapi=1&origin=${window.location.origin}`;
};

const VideoModal = ({ open, onOpenChange, videoUrl, videoType, thumbnail, title }: VideoModalProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout>>();

  const thumbUrl = thumbnail || (videoType === "youtube" ? getYouTubeThumbnail(videoUrl) : "");

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      if (videoRef.current) videoRef.current.pause();
      // Pause YouTube by removing src
      setStarted(false);
      setIsPlaying(false);
      setProgress(0);
    }
  }, [open]);

  // MP4 progress tracking
  useEffect(() => {
    const v = videoRef.current;
    if (!v || videoType !== "mp4") return;
    const onTime = () => {
      if (v.duration) setProgress((v.currentTime / v.duration) * 100);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [videoType, started]);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  const handleStart = () => {
    setStarted(true);
    setIsPlaying(true);
    if (videoType === "mp4") {
      setTimeout(() => videoRef.current?.play(), 100);
    }
  };

  const togglePlay = () => {
    if (videoType === "mp4" && videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    } else if (videoType === "youtube" && iframeRef.current?.contentWindow) {
      const cmd = isPlaying ? "pauseVideo" : "playVideo";
      iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: "command", func: cmd, args: [] }), "*");
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoType === "mp4" && videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    } else if (videoType === "youtube" && iframeRef.current?.contentWindow) {
      const cmd = isMuted ? "unMute" : "mute";
      iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: "command", func: cmd, args: [] }), "*");
      setIsMuted(!isMuted);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (videoType === "mp4" && videoRef.current && progressRef.current) {
      const rect = progressRef.current.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      videoRef.current.currentTime = pct * videoRef.current.duration;
    }
  };

  const handleFullscreen = () => {
    const container = document.querySelector("[data-video-container]") as HTMLElement;
    if (container) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        container.requestFullscreen();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1400px] w-[95vw] sm:w-[92vw] md:w-[90vw] lg:w-[85vw] xl:w-[80vw] p-0 bg-[#0a0a0a] border border-white/[0.08] sm:rounded-2xl overflow-hidden shadow-[0_25px_80px_-12px_rgba(0,0,0,0.8)] gap-0 [&>button]:hidden">
        {/* Close button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute -top-12 right-0 sm:top-3 sm:right-3 z-50 bg-white/10 backdrop-blur-md hover:bg-white/20 text-white/80 hover:text-white rounded-full p-2.5 transition-all duration-300 hover:scale-110"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Title bar */}
        {title && (
          <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="text-white/50 text-sm font-medium tracking-wide">{title}</span>
          </div>
        )}

        <div
          data-video-container
          className="relative w-full aspect-video cursor-pointer"
          onMouseMove={resetControlsTimer}
          onMouseEnter={() => setShowControls(true)}
        >
          {/* Thumbnail / Pre-play state */}
          <AnimatePresence>
            {!started && (
              <motion.button
                initial={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.4 }}
                onClick={handleStart}
                className="absolute inset-0 z-20 w-full h-full group"
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt="Video preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = getYouTubeThumbnail(videoUrl).replace("maxresdefault", "hqdefault");
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/30 via-primary/10 to-transparent" />
                )}
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/30 transition-colors duration-300" />
                {/* Play button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/95 backdrop-blur-sm flex items-center justify-center shadow-[0_0_60px_rgba(255,255,255,0.15)] group-hover:shadow-[0_0_80px_rgba(255,255,255,0.25)] transition-shadow duration-500"
                  >
                    <Play className="h-8 w-8 sm:h-10 sm:w-10 text-[#0a0a0a] ml-1" fill="#0a0a0a" />
                  </motion.div>
                </div>
                {/* "Watch Demo" label */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
                  <span className="text-white/70 text-sm font-medium tracking-wider uppercase">Watch Demo</span>
                </div>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Video layer */}
          {started && (
            <>
              {videoType === "youtube" ? (
                <iframe
                  ref={iframeRef}
                  src={getEmbedUrl(videoUrl)}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="Product Demo"
                  style={{ border: 0 }}
                />
              ) : (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain bg-black"
                  autoPlay
                  playsInline
                  onClick={togglePlay}
                />
              )}

              {/* Custom controls overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: showControls ? 1 : 0 }}
                transition={{ duration: 0.25 }}
                className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none"
              >
                <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-16 pb-4 px-5 pointer-events-auto">
                  {/* Progress bar */}
                  {videoType === "mp4" && (
                    <div
                      ref={progressRef}
                      onClick={handleProgressClick}
                      className="w-full h-1.5 bg-white/20 rounded-full mb-4 cursor-pointer group/bar relative"
                    >
                      <div
                        className="h-full bg-white rounded-full relative transition-all"
                        style={{ width: `${progress}%` }}
                      >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg opacity-0 group-hover/bar:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  )}

                  {/* Control buttons */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={togglePlay}
                        className="text-white/90 hover:text-white transition-colors p-1"
                      >
                        {isPlaying ? <Pause className="h-5 w-5" fill="white" /> : <Play className="h-5 w-5 ml-0.5" fill="white" />}
                      </button>
                      <button
                        onClick={toggleMute}
                        className="text-white/90 hover:text-white transition-colors p-1"
                      >
                        {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                      </button>
                    </div>
                    <button
                      onClick={handleFullscreen}
                      className="text-white/90 hover:text-white transition-colors p-1"
                    >
                      <Maximize className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoModal;
