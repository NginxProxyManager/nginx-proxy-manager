pipeline {
  options {
    buildDiscarder(logRotator(artifactDaysToKeepStr: '', artifactNumToKeepStr: '', daysToKeepStr: '', numToKeepStr: '10'))
    disableConcurrentBuilds()
  }
  agent any
  environment {
      IMAGE_NAME      = nginx-proxy-manager
      TEMP_IMAGE_NAME = nginx-proxy-manager-build_${BUILD_NUMBER}
    }
  stages {
    stage('Prepare') {
        steps {
          sh '''docker pull ${DOCKER_PRIVATE_REGISTRY}/nginx-proxy-manager-base
docker pull ${DOCKER_CI_TOOLS}'''

          sh '''CWD=`pwd`
docker run --rm \\
  -v $CWD/manager:/srv/manager \\
  -w /srv/manager \\
  ${DOCKER_PRIVATE_REGISTRY}/nginx-proxy-manager-base \\
  npm --registry=$NPM_REGISTRY install
exit $?'''

          sh '''CWD=`pwd`
docker run --rm -v $CWD/manager:/srv/manager -w /srv/manager ${DOCKER_PRIVATE_REGISTRY}/nginx-proxy-manager-base gulp build
exit $?'''

          sh '''CWD=`pwd`
docker run --rm -e NODE_ENV=production -v $CWD/manager:/srv/manager -w /srv/manager ${DOCKER_PRIVATE_REGISTRY}/nginx-proxy-manager-base npm prune --production
exit $?'''

          sh '''docker run --rm \\
-v $CWD/manager:/data \\
${DOCKER_CI_TOOLS} \\
node-prune'''
        }
      }
    }
    stage('Build') {
      steps {
        def TAG_VERSION = getPackageVersion()

        sh '''docker build -t $TEMP_IMAGE_NAME .
exit $?'''
      }
    }
    stage('Publish') {
      steps {
        sh '''docker tag $TEMP_IMAGE_NAME ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:latest
docker push ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:latest
exit $?'''

        sh '''docker tag $TEMP_IMAGE_NAME ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION
docker push ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION
exit $?'''

        sh '''docker tag $TEMP_IMAGE_NAME docker-io/jc21/$IMAGE_NAME:latest
docker push docker-io/jc21/$IMAGE_NAME:latest
exit $?'''

        sh '''docker tag $TEMP_IMAGE_NAME docker-io/jc21/$IMAGE_NAME:$TAG_VERSION
docker push docker-io/jc21/$IMAGE_NAME:$TAG_VERSION
exit $?'''
      }
    }
  }
  triggers {
    bitbucketPush()
  }
  post {
    success {
      slackSend color: "#72c900", message: "SUCCESS: <${BUILD_URL}|${JOB_NAME}> build #${BUILD_NUMBER} - Duration: ${currentBuild.durationString}"
    }
    failure {
      slackSend color: "#d61111", message: "FAILED: <${BUILD_URL}|${JOB_NAME}> build #${BUILD_NUMBER} - Duration: ${currentBuild.durationString}"
    }
  }
}

def getPackageVersion() {
  ver = sh(script: 'docker run --rm -v $(pwd)/manager:/data $DOCKER_CI_TOOLS bash -c "cat /data/package.json|jq -r \'.version\'"', returnStdout: true)
  return ver.trim()
}
