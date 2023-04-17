(() => {
  const searchParems = new URLSearchParams(window.location.search)

  if (!window.location.search.length) {
    searchParems.set('webcam', 1)

    window.open('http://localhost:5500/?webcam=2')
  }

  history.pushState(null, '', window.location.pathname + '?' + searchParems.toString())
})()

const video = document.getElementById('video');
const select = document.getElementById('select');

let labels = [];

let activeEffect;

class Dependency {
  constructor() {
    this.subscribers = new Set()
  }

  depend() {
    if (activeEffect) this.subscribers.add(activeEffect)
  }

  notify() {
    this.subscribers.forEach((subscriber) => subscriber())
  }
}

const watchEffect = (fn) => {
  activeEffect = fn

  fn()

  activeEffect = null
}

function reactive(obj) {
  const dep = new Dependency()

  const handler = {
    get(target, prop, receiver) {
      dep.depend()

      return Reflect.get(target, prop, receiver)
    },
    set(target, prop, value) {
      target[prop] = value

      dep.notify()

      return Reflect.set(target, prop, value)
    }
  }

  return new Proxy(obj, handler)
}

const gotDevices = (mediaDevices) => {
  select.innerHTML = '';

  select.appendChild(document.createElement('option'));

  let count = 1;

  mediaDevices.forEach(mediaDevice => {
    if (mediaDevice.kind === 'videoinput') {
      const option = document.createElement('option');

      option.value = mediaDevice.deviceId;

      const label = mediaDevice.label || `Camera ${count++}`;
      const textNode = document.createTextNode(label);

      option.appendChild(textNode);
      select.appendChild(option);
    }
  });
}

const changeWebcam = () => {
  if (typeof currentStream !== 'undefined') {
    stopMediaTracks(currentStream);
  }

  const videoConstraints = {};

  if (select.value === '') {
    videoConstraints.facingMode = 'environment';
  } else {
    videoConstraints.deviceId = { exact: select.value };
  }

  const constraints = {
    video: videoConstraints,
    audio: false
  };

  navigator.mediaDevices
    .getUserMedia(constraints)
    .then(stream => {
      currentStream = stream;

      video.srcObject = stream;

      return navigator.mediaDevices.enumerateDevices();
    })
    .then(gotDevices)
    .catch(error => {
      console.error(error);
    });
}

(() => {
  const MODEL_URL = '/models'

  const newLabels = reactive({
    data: [''],
  })

  const user = reactive({
    id: ''
  })

  const isDataSend = reactive({
    isSend: false,
  })

  const setUser = (id) => {
    user.id = id
  }

  const resetStatus = () => {
    isDataSend.isSend = true

    setTimeout(() => {
      isDataSend.isSend = false
    }, 1_000)
  }

  watchEffect(() => {
    if (newLabels.data && newLabels.data.length) {
      const faceRecognition = async () => {
        const labeledFaceDescriptors = await getLabeledFaceDescriptions();
        const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors);

        video.addEventListener("playing", () => {
          location.reload();
        });

        const canvas = faceapi.createCanvasFromMedia(video);

        document.body.append(canvas);

        const displaySize = { width: video.width, height: video.height };

        faceapi.matchDimensions(canvas, displaySize);

        setInterval(async () => {
          const detections = await faceapi
            .detectAllFaces(video)
            .withFaceLandmarks()
            .withFaceDescriptors();

          const resizedDetections = faceapi.resizeResults(detections, displaySize);

          canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);

          const results = resizedDetections.map((d) => {
            return faceMatcher.findBestMatch(d.descriptor);
          });

          results.forEach((result, i) => {
            const box = resizedDetections[i].detection.box;

            const drawBox = new faceapi.draw.DrawBox(box, {
              label: result,
            });

            drawBox.draw(canvas);

            if (result.label !== 'unknown') {
              setUser(result.label.slice(result.label.lastIndexOf('--')).replace('--', '').trim())
            }
          });
        }, 400);
      }

      Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      ])
        .then(changeWebcam)
        .then(faceRecognition)

      const videoPlaying = () => {
        const canvas = faceapi.createCanvasFromMedia(video);

        document.body.append(canvas);

        faceapi.matchDimensions(canvas, { height: video.height, width: video.width });

        setInterval(async () => {
          const detections = await faceapi
            .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks();

          const resizedDetections = faceapi.resizeResults(detections, {
            height: video.height,
            width: video.width,
          });

          canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);

          faceapi.draw.drawDetections(canvas, resizedDetections);
          faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
        }, 100);
      }

      const getLabeledFaceDescriptions = () => {
        return Promise.all(
          newLabels.data.map(async (label) => {
            const descriptions = [];

            for (let i = 0; i <= 5; i++) {
              try {
                const path = `labels/${label}/${i}.png`

                if (!path) return

                const img = await faceapi.fetchImage(path);

                if (img) {
                  const detections = await faceapi
                    .detectSingleFace(img)
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                  descriptions.push(detections.descriptor);
                }
              } catch (error) {
                console.log(error)
              }
            }

            return new faceapi.LabeledFaceDescriptors(label, descriptions);
          })
        );
      }

      video.addEventListener("play", videoPlaying);

      let interval

      function checkWebcams() {
        const options = document.querySelectorAll('option')

        if (Array.from(options).length > 1) {
          clearInterval(interval)

          Array.from(options).forEach((_, index) => {
            if (index === 1) {
              if (window.location.href === 'http://localhost:5500/?webcam=2') {
                select.value = Array.from(options)[index].value

                changeWebcam()
              }
            } else if (index === 2) {
              if (window.location.href === 'http://localhost:5500/?webcam=1') {
                select.value = Array.from(options)[index].value

                changeWebcam()
              }
            }
          })
        }
      }

      interval = setInterval(() => {
        checkWebcams()
      }, 100)
    }
  })

  watchEffect(async () => {
    if (user.id && !isDataSend.isSend) {
      resetStatus()

      const direction = window.location.search === '?webcam=1' ? 'enter' : 'exit'

      await sendUserData({ id: user.id, direction, event_time: new Date() })

      setUser('')
    }
  })


  const checkLabelData = async () => {
    try {
      const res = await fetch('http://localhost:8001/api/labels')
      const data = await res.json()

      newLabels.data = data
    } catch {
      newLabels.data = ['Alex']
    }
  }

  checkLabelData()

  setInterval(() => {
    checkLabelData()
  }, 300_000)
})()


const stopMediaTracks = (stream) => {
  stream.getTracks().forEach(track => {
    track.stop();
  });
}

const sendUserData = async (person) => {
  await fetch('http://localhost:3000/api/v1/users/recognize', {
    method: 'POST',
    body: JSON.stringify(person),
  })
}
