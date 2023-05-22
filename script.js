const video = document.getElementById('video');
const select = document.getElementById('select');

let origin

(() => {
  const searchParems = new URLSearchParams(window.location.search)

  origin = location.origin

  if (!window.location.search.length) {
    searchParems.set('webcam', 1)

    window.open(`${origin}/?webcam=2`)
  }

  history.pushState(null, '', window.location.pathname + '?' + searchParems.toString())
})()


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

      option.setAttribute('data-device-name', mediaDevice.label)

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
    console.log(select.value);
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
    user.date = Date.now()
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

        let isInFocus = false

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


          if (results.length) {
            isInFocus = true
          } else {
            isInFocus = false
          }

          results.forEach((result, i) => {
            const box = resizedDetections[i].detection.box;

            if (result.label) {
              isInFocus = true
            }

            const drawBox = new faceapi.draw.DrawBox(box, {
              label: result,
            });

            drawBox.draw(canvas);

            if (result.label !== 'unknown') {
              setUser(result.label.slice(result.label.lastIndexOf('--')).replace('--', '').trim())
            } else {
              setUser('')
            }
          });

          // if (!isInFocus) {
          //   closeDoor()
          // }
        }, 1_000);
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

          Array.from(options).forEach((option, index) => {
            if (index === 2) {
              if (window.location.href === `${origin}/?webcam=1`) {
                select.value = Array.from(options)[index].value

                changeWebcam()
              }
            } else if (index === Array.from(options).length - 2) {
              if (window.location.href === `${origin}/?webcam=2`) {
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
    let statusData

    if (user.id) {
      const direction = window.location.search === '?webcam=1' ? 'enter' : 'exit'

      statusData = await sendUserData({ person_id: user.id, direction, event_time: new Date() }).status

      isDataSend.value = true
      setUser('')
    } else if (isDataSend.value && statusData === 200) {
      await closeDoor()

      setTimeout(() => {
        isDataSend.value = false
      }, 1_000)

    }

    return
  })


  const checkLabelData = async () => {
    try {
      const res = await fetch('http://localhost:8081/api/labels')
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
  // const { status } = await fetch('http://localhost:8000/api/v1/users/recognize', {
  //   method: 'POST',
  //   body: JSON.stringify(person),
  // })

  // if (status === 201) {
  await fetch('http://192.168.104.116/door/open', {
    method: 'GET',
  })
  // }
}

const closeDoor = async () => {
  await fetch('http://192.168.104.116/door/close', {
    method: 'GET',
  })
}
