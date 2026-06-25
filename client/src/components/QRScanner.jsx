import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Smartphone, RotateCcw } from 'lucide-react';

export default function QRScanner({ onScan, onClose, onError }) {
  const containerRef = useRef(null);
  const scannerRef = useRef(null);
  const [cameraState, setCameraState] = useState('initializing');
  const [hasCamera, setHasCamera] = useState(true);

  useEffect(() => {
    let scanner;
    let mounted = true;

    Html5Qrcode.getCameras()
      .then((cameras) => {
        if (!mounted) return;
        if (!cameras || cameras.length === 0) {
          setHasCamera(false);
          setCameraState('no-camera');
          return;
        }

        scanner = new Html5Qrcode('qr-reader-container');
        scannerRef.current = scanner;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.333
        };

        const rearCam = cameras.find(
          (c) => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('environment')
        );
        const cameraId = rearCam ? rearCam.id : cameras[0].id;

        return scanner.start(
          { deviceId: { exact: cameraId } },
          config,
          (decodedText) => {
            if (!mounted) return;
            scanner.stop().catch(() => {});
            setCameraState('scanned');
            onScan(decodedText);
          },
          () => {}
        );
      })
      .then(() => {
        if (mounted) setCameraState('scanning');
      })
      .catch((err) => {
        if (!mounted) return;
        console.error('Camera start error:', err);
        setCameraState('error');
        if (onError) onError(err.message || 'Failed to start camera');
      });

    return () => {
      mounted = false;
      if (scanner) {
        scanner.stop().catch(() => {});
        scanner.clear();
      }
    };
  }, []);

  const handleClose = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current.clear();
    }
    onClose();
  };

  return (
    <div className="qr-camera-scanner">
      <div className="qr-camera-header">
        <Camera size={18} />
        <span>Scan Student QR Code</span>
        <button className="qr-camera-close" onClick={handleClose}>
          <X size={18} />
        </button>
      </div>

      <div className="qr-camera-body">
        {cameraState === 'initializing' && (
          <div className="qr-camera-loading">
            <div className="spinner spinner-dark" />
            <span>Initializing camera...</span>
          </div>
        )}

        {cameraState === 'no-camera' && (
          <div className="qr-camera-error">
            <Smartphone size={36} />
            <h4>No Camera Found</h4>
            <p>This device does not have a camera, or camera permission was denied.</p>
            <p className="qr-camera-hint">You can still type or paste the QR code manually below.</p>
            <button className="btn btn-outline btn-sm" onClick={handleClose}>
              <RotateCcw size={14} /> Go Back
            </button>
          </div>
        )}

        {cameraState === 'error' && (
          <div className="qr-camera-error">
            <Camera size={36} />
            <h4>Camera Error</h4>
            <p>Could not access the camera. Please check your permissions and try again.</p>
            <button className="btn btn-outline btn-sm" onClick={handleClose}>
              <RotateCcw size={14} /> Go Back
            </button>
          </div>
        )}

        {(cameraState === 'scanning' || cameraState === 'scanned') && (
          <div className="qr-camera-view" ref={containerRef}>
            <div id="qr-reader-container" />
            <div className="qr-camera-overlay">
              <div className="qr-camera-frame">
                <div className="qr-frame-corner tl" />
                <div className="qr-frame-corner tr" />
                <div className="qr-frame-corner bl" />
                <div className="qr-frame-corner br" />
              </div>
              <p className="qr-camera-instruction">
                {cameraState === 'scanned' ? 'QR Code detected!' : 'Point camera at the student\'s QR code'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
