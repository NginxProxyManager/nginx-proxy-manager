pipeline {
  options {
    buildDiscarder(logRotator(numToKeepStr: '10'))
    disableConcurrentBuilds()
  }
  agent any
  environment {
    IMAGE_NAME          = "nginx-proxy-manager"
    TEMP_IMAGE_NAME     = "nginx-proxy-manager-build_${BUILD_NUMBER}"
    TEMP_IMAGE_NAME_ARM = "nginx-proxy-manager-armhf-build_${BUILD_NUMBER}"
    TAG_VERSION         = getPackageVersion()
  }
  stages {
    stage('Build') {
      parallel {
        stage('x86_64') {
          when {
            branch 'master'
          }
          steps {
            ansiColor('xterm') {
              // Codebase
              sh 'docker pull jc21/$IMAGE_NAME-base'
              sh 'docker run --rm -v $(pwd)/manager:/srv/manager -w /srv/manager jc21/$IMAGE_NAME-base yarn --registry=$NPM_REGISTRY install'
              sh 'docker run --rm -v $(pwd)/manager:/srv/manager -w /srv/manager jc21/$IMAGE_NAME-base gulp build'
              sh 'rm -rf node_modules'
              sh 'docker run --rm -v $(pwd)/manager:/srv/manager -w /srv/manager jc21/$IMAGE_NAME-base yarn --registry=$NPM_REGISTRY install --prod'
              sh 'docker run --rm -v $(pwd)/manager:/data $DOCKER_CI_TOOLS node-prune'

              // Docker Build
              sh 'docker build --pull --no-cache --squash --compress -t $TEMP_IMAGE_NAME .'

              // Private Registry
              sh 'docker tag $TEMP_IMAGE_NAME $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:latest'
              sh 'docker push $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:latest'
              sh 'docker tag $TEMP_IMAGE_NAME ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION'
              sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION'

              // Dockerhub
              sh 'docker tag $TEMP_IMAGE_NAME docker.io/jc21/$IMAGE_NAME:latest'
              sh 'docker tag $TEMP_IMAGE_NAME docker.io/jc21/$IMAGE_NAME:$TAG_VERSION'

              withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '$dpass'"
                sh 'docker push docker.io/jc21/$IMAGE_NAME:latest'
                sh 'docker push docker.io/jc21/$IMAGE_NAME:$TAG_VERSION'
              }

              sh 'docker rmi $TEMP_IMAGE_NAME'
            }
          }
        }
        stage('armhf') {
          when {
            branch 'master'
          }
          agent {
            label 'armhf'
          }
          steps {
            ansiColor('xterm') {
              // Codebase
              sh 'docker pull jc21/$IMAGE_NAME-base:armhf'
              sh 'docker run --rm -v $(pwd)/manager:/srv/manager -w /srv/manager jc21/$IMAGE_NAME-base:armhf yarn --registry=$NPM_REGISTRY install'
              sh 'docker run --rm -v $(pwd)/manager:/srv/manager -w /srv/manager jc21/$IMAGE_NAME-base:armhf gulp build'
              sh 'docker run --rm -v $(pwd)/manager:/srv/manager -w /srv/manager jc21/$IMAGE_NAME-base:armhf rm -rf node_modules'
              sh 'docker run --rm -v $(pwd)/manager:/srv/manager -w /srv/manager jc21/$IMAGE_NAME-base:armhf yarn --registry=$NPM_REGISTRY install --prod'
              sh 'docker run --rm -v $(pwd)/manager:/data $DOCKER_CI_TOOLS:latest-armhf node-prune'

              // Docker Build
              sh 'docker build --pull --no-cache --squash --compress -f Dockerfile.armhf -t $TEMP_IMAGE_NAME_ARM .'

              // Private Registry
              sh 'docker tag $TEMP_IMAGE_NAME_ARM $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:latest-armhf'
              sh 'docker push $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:latest-armhf'
              sh 'docker tag $TEMP_IMAGE_NAME_ARM ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION-armhf'
              sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION-armhf'

              // Dockerhub
              sh 'docker tag $TEMP_IMAGE_NAME_ARM docker.io/jc21/$IMAGE_NAME:latest-armhf'
              sh 'docker tag $TEMP_IMAGE_NAME_ARM docker.io/jc21/$IMAGE_NAME:$TAG_VERSION-armhf'

              withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '$dpass'"
                sh 'docker push docker.io/jc21/$IMAGE_NAME:latest-armhf'
                sh 'docker push docker.io/jc21/$IMAGE_NAME:$TAG_VERSION-armhf'
              }

              sh 'docker rmi $TEMP_IMAGE_NAME_ARM'
            }
          }
        }
      }
    }
  }
  post {
    success {
      juxtapose event: 'success'
      sh 'figlet "SUCCESS"'
    }
    failure {
      juxtapose event: 'failure'
      sh 'figlet "FAILURE"'
    }
  }
}

def getPackageVersion() {
  ver = sh(script: 'docker run --rm -v $(pwd)/manager:/data $DOCKER_CI_TOOLS bash -c "cat /data/package.json|jq -r \'.version\'"', returnStdout: true)
  return ver.trim()
}

