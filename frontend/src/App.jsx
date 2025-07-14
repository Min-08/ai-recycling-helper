/* eslint-disable react-hooks/exhaustive-deps */
import React, { useRef, useState, useEffect, useCallback } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ""; // e.g. http://localhost:5000

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [resultText, setResultText] = useState("카메라를 켜고 쓰레기를 비춰주세요.");
  const [buttonState, setButtonState] = useState("capture");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [currentFacingMode, setCurrentFacingMode] = useState("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // ---------------------------------------------------------------------
  // Camera utils
  // ---------------------------------------------------------------------
  const stopTracks = (stream) => {
    stream?.getTracks().forEach((t) => t.stop());
  };

  const startCamera = useCallback(async (mode) => {
    try {
      stopTracks(videoRef.current?.srcObject);

      const constraints = { video: { facingMode: mode } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          setIsCameraReady(true);
          setResultText("카메라가 준비되었습니다. 쓰레기를 비춰주세요.");
        };
      }
      setCurrentFacingMode(mode);
      setPhotoDataUrl(null);
      setButtonState("capture");
      setError(null);
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("카메라에 접근할 수 없습니다. 권한을 허용해주세요.");
      setIsCameraReady(false);
      setResultText("카메라를 사용할 수 없습니다.");
      throw err;
    }
  }, []);

  // First mount – init cam & check # of devices
  useEffect(() => {
    const init = async () => {
      try {
        await startCamera("environment");
      } catch {
        await startCamera("user").catch(() => {});
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setHasMultipleCameras(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch (err) {
        console.error("enumerateDevices error", err);
      }
    };
    init();

    return () => stopTracks(videoRef.current?.srcObject);
  }, []);

  // ---------------------------------------------------------------------
  // Capture & analyze
  // ---------------------------------------------------------------------
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !isCameraReady) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // ↓ compress to JPEG 0.8 to reduce payload (< 4 MB)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    setPhotoDataUrl(dataUrl);

    stopTracks(video.srcObject);
    setButtonState("analyze");
    setResultText("사진이 촬영되었습니다. '결과 분석' 버튼을 눌러주세요.");
  };

  const analyzePhoto = async () => {
    if (!photoDataUrl) return;
    setIsLoading(true);
    setResultText("분석 중입니다... 잠시만 기다려주세요.");
    setError(null);

    try {
      const base64 = photoDataUrl.split(",", 2)[1];
      const payload = {
        imageData: base64,
        prompt:
          "이 이미지에 있는 쓰레기의 종류는 무엇이며, 어떻게 분리배출해야 하는지 한국어로 간단히 알려줘. 마크다운 문법은 사용하지 말고 일반 텍스트만 해."
      };

      const resp = await fetch(`${BACKEND_URL}/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const e = await resp.json();
        throw new Error(e.error || "서버 오류");
      }

      const data = await resp.json();
      setResultText(data.text || "분석 결과가 없습니다.");
    } catch (err) {
      console.error(err);
      setError(err.message);
      setResultText("분석 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
      setButtonState("reset");
    }
  };

  // ---------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------
  const onBtnClick = () => {
    if (buttonState === "capture") capturePhoto();
    else if (buttonState === "analyze") analyzePhoto();
    else if (buttonState === "reset") startCamera(currentFacingMode);
  };

  const toggleCamera = () => startCamera(currentFacingMode === "environment" ? "user" : "environment");

  const btnLabel = isLoading
    ? "분석 중..."
    : buttonState === "capture"
    ? "사진 찍기"
    : buttonState === "analyze"
    ? "결과 분석"
    : "다시하기";

  // ---------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 font-inter">
      <header className="w-full max-w-2xl text-center mb-6">
        <h1 className="text-3xl font-bold text-black">AI 분리배출 도우미</h1>
      </header>

      <div className="relative w-full max-w-2xl aspect-square bg-gray-300 rounded-xl overflow-hidden shadow-xl flex items-center justify-center mb-6">
        {!isCameraReady && !photoDataUrl && <p className="text-gray-600 text-lg">카메라 로딩 중...</p>}
        <video ref={videoRef} autoPlay playsInline className={`w-full h-full object-cover ${photoDataUrl ? "hidden" : ""}`} />
        {photoDataUrl && <img src={photoDataUrl} alt="Captured" className="w-full h-full object-cover" />}
        <canvas ref={canvasRef} className="hidden" />
        {hasMultipleCameras && (
          <button onClick={toggleCamera} className="absolute top-3 left-3 bg-white bg-opacity-75 text-black text-sm font-semibold py-1 px-3 rounded-lg shadow-md z-10 hover:bg-opacity-90 transition-colors">
            {currentFacingMode === "user" ? "전방" : "후방"}
          </button>
        )}
      </div>

      <button onClick={onBtnClick} disabled={isLoading || (!isCameraReady && buttonState === "capture")}
        className={`w-full max-w-2xl py-4 px-6 rounded-xl shadow-lg text-white text-xl font-semibold mb-6 transition-all duration-300 ${isLoading || (!isCameraReady && buttonState === "capture") ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"}`}
      >
        {btnLabel}
      </button>

      <div className="w-full max-w-2xl bg-white p-6 rounded-xl shadow-xl min-h-[150px] flex flex-col justify-start">
        {error && <p className="text-red-600 font-medium mb-2">{error}</p>}
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
          </div>
        ) : (
          <p className="text-gray-800 whitespace-pre-wrap">{resultText}</p>
        )}
      </div>
    </div>
  );
}